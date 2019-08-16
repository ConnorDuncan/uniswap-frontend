import { ethers } from 'ethers'

import FACTORY_ABI from '../constants/abis/factory'
import EXCHANGE_ABI from '../constants/abis/exchange'
import ERC20_ABI from '../constants/abis/erc20'
import T2CR_ABI from '../constants/abis/arbitrable-token-list'
import ERC20_BYTES32_ABI from '../constants/abis/erc20_bytes32'
import { FACTORY_ADDRESSES, T2CR_ADDRESSES } from '../constants'
import { formatFixed } from '@uniswap/sdk'

import UncheckedJsonRpcSigner from './signer'

const { bigNumberify } = ethers.utils

export const ERROR_CODES = ['TOKEN_NAME', 'TOKEN_SYMBOL', 'TOKEN_DECIMALS'].reduce(
  (accumulator, currentValue, currentIndex) => {
    accumulator[currentValue] = currentIndex
    return accumulator
  },
  {}
)

export function safeAccess(object, path) {
  return object
    ? path.reduce(
        (accumulator, currentValue) => (accumulator && accumulator[currentValue] ? accumulator[currentValue] : null),
        object
      )
    : null
}

const ETHERSCAN_PREFIXES = {
  1: '',
  3: 'ropsten.',
  4: 'rinkeby.',
  5: 'goerli.',
  42: 'kovan.'
}
export function getEtherscanLink(networkId, data, type) {
  const prefix = `https://${ETHERSCAN_PREFIXES[networkId] || ETHERSCAN_PREFIXES[1]}etherscan.io`

  switch (type) {
    case 'transaction': {
      return `${prefix}/tx/${data}`
    }
    case 'address':
    default: {
      return `${prefix}/address/${data}`
    }
  }
}

export function getNetworkName(networkId) {
  switch (networkId) {
    case 1: {
      return 'the Main Ethereum Network'
    }
    case 3: {
      return 'the Ropsten Test Network'
    }
    case 4: {
      return 'the Rinkeby Test Network'
    }
    case 5: {
      return 'the Görli Test Network'
    }
    case 42: {
      return 'the Kovan Test Network'
    }
    default: {
      return 'the correct network'
    }
  }
}

export function shortenAddress(address, digits = 4) {
  if (!isAddress(address)) {
    throw Error(`Invalid 'address' parameter '${address}'.`)
  }
  return `${address.substring(0, digits + 2)}...${address.substring(42 - digits)}`
}

export function shortenTransactionHash(hash, digits = 4) {
  return `${hash.substring(0, digits + 2)}...${hash.substring(66 - digits)}`
}

export function isAddress(value) {
  try {
    return ethers.utils.getAddress(value.toLowerCase())
  } catch {
    return false
  }
}

export function calculateGasMargin(value, margin) {
  const offset = value.mul(margin).div(bigNumberify(10000))
  return value.add(offset)
}

// account is optional
export function getProviderOrSigner(library, account) {
  return account ? new UncheckedJsonRpcSigner(library.getSigner(account)) : library
}

// account is optional
export function getContract(address, ABI, library, account) {
  if (!isAddress(address) || address === ethers.constants.AddressZero) {
    throw Error(`Invalid 'address' parameter '${address}'.`)
  }

  return new ethers.Contract(address, ABI, getProviderOrSigner(library, account))
}

// account is optional
export function getFactoryContract(networkId, library, account) {
  return getContract(FACTORY_ADDRESSES[networkId], FACTORY_ABI, library, account)
}

// account is optional
export function getExchangeContract(exchangeAddress, library, account) {
  return getContract(exchangeAddress, EXCHANGE_ABI, library, account)
}

// get token name
export async function getTokenName(tokenAddress, library) {
  if (!isAddress(tokenAddress)) {
    throw Error(`Invalid 'tokenAddress' parameter '${tokenAddress}'.`)
  }

  return getContract(tokenAddress, ERC20_ABI, library)
    .name()
    .catch(() =>
      getContract(tokenAddress, ERC20_BYTES32_ABI, library)
        .name()
        .then(bytes32 => ethers.utils.parseBytes32String(bytes32))
    )
    .catch(error => {
      error.code = ERROR_CODES.TOKEN_SYMBOL
      throw error
    })
}

// get token symbol
export async function getTokenSymbol(tokenAddress, library) {
  if (!isAddress(tokenAddress)) {
    throw Error(`Invalid 'tokenAddress' parameter '${tokenAddress}'.`)
  }

  return getContract(tokenAddress, ERC20_ABI, library)
    .symbol()
    .catch(() => {
      const contractBytes32 = getContract(tokenAddress, ERC20_BYTES32_ABI, library)
      return contractBytes32.symbol().then(bytes32 => ethers.utils.parseBytes32String(bytes32))
    })
    .catch(error => {
      error.code = ERROR_CODES.TOKEN_SYMBOL
      throw error
    })
}

// get token decimals
export async function getTokenDecimals(tokenAddress, library) {
  if (!isAddress(tokenAddress)) {
    throw Error(`Invalid 'tokenAddress' parameter '${tokenAddress}'.`)
  }

  return getContract(tokenAddress, ERC20_ABI, library)
    .decimals()
    .catch(error => {
      error.code = ERROR_CODES.TOKEN_DECIMALS
      throw error
    })
}

export async function getTokenInfo(tokenAddress, library, networkId) {
  if (!isAddress(tokenAddress)) {
    throw Error(`Invalid 'tokenAddress' parameter '${tokenAddress}'.`)
  }

  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
  const t2cr = getContract(T2CR_ADDRESSES[networkId], T2CR_ABI, library, ZERO_ADDRESS)

  const ZERO_ID = '0x0000000000000000000000000000000000000000000000000000000000000000'
  const filter = [false, true, false, true, false, true, false, false]
  const tokenIDs = (await t2cr.queryTokens(ZERO_ID, 1, filter, true, tokenAddress)).filter(ID => ID !== ZERO_ID)

  if (tokenIDs.length === 0) return null

  return t2cr.getTokenInfo(tokenIDs[0][0])
}

// get the exchange address for a token from the factory
export async function getTokenExchangeAddressFromFactory(tokenAddress, networkId, library) {
  return getFactoryContract(networkId, library).getExchange(tokenAddress)
}

// get the ether balance of an address
export async function getEtherBalance(address, library) {
  if (!isAddress(address)) {
    throw Error(`Invalid 'address' parameter '${address}'`)
  }
  return library.getBalance(address)
}

export function formatEthBalance(balance) {
  return amountFormatter(balance, 18, 6)
}

export function formatTokenBalance(balance, decimal) {
  return !!(balance && Number.isInteger(decimal)) ? amountFormatter(balance, decimal, Math.min(4, decimal)) : 0
}

export function formatToUsd(price) {
  const format = { decimalSeparator: '.', groupSeparator: ',', groupSize: 3 }
  const usdPrice = formatFixed(price, {
    decimalPlaces: 2,
    dropTrailingZeros: false,
    format
  })
  return usdPrice
}

// get the token balance of an address
export async function getTokenBalance(tokenAddress, address, library) {
  if (!isAddress(tokenAddress) || !isAddress(address)) {
    throw Error(`Invalid 'tokenAddress' or 'address' parameter '${tokenAddress}' or '${address}'.`)
  }

  return getContract(tokenAddress, ERC20_ABI, library).balanceOf(address)
}

// get the token allowance
export async function getTokenAllowance(address, tokenAddress, spenderAddress, library) {
  if (!isAddress(address) || !isAddress(tokenAddress) || !isAddress(spenderAddress)) {
    throw Error(
      "Invalid 'address' or 'tokenAddress' or 'spenderAddress' parameter" +
        `'${address}' or '${tokenAddress}' or '${spenderAddress}'.`
    )
  }

  return getContract(tokenAddress, ERC20_ABI, library).allowance(address, spenderAddress)
}

// amount must be a BigNumber, {base,display}Decimals must be Numbers
export function amountFormatter(amount, baseDecimals = 18, displayDecimals = 3, useLessThan = true) {
  if (
    baseDecimals > 18 ||
    displayDecimals > 18 ||
    displayDecimals > baseDecimals ||
    isNaN(baseDecimals) ||
    isNaN(displayDecimals)
  ) {
    throw Error(`Invalid combination of baseDecimals '${baseDecimals}' and displayDecimals '${displayDecimals}.`)
  }

  // if balance is falsy, return undefined
  if (!amount) {
    return undefined
  }
  // if amount is 0, return
  else if (amount.isZero()) {
    return '0'
  }
  // amount > 0
  else {
    // amount of 'wei' in 1 'ether'
    const baseAmount = bigNumberify(10).pow(bigNumberify(baseDecimals))

    const minimumDisplayAmount = baseAmount.div(
      bigNumberify(10).pow(bigNumberify(displayDecimals))
    )

    // if balance is less than the minimum display amount
    if (amount.lt(minimumDisplayAmount)) {
      return useLessThan
        ? `<${ethers.utils.formatUnits(minimumDisplayAmount, baseDecimals)}`
        : `${ethers.utils.formatUnits(amount, baseDecimals)}`
    }
    // if the balance is greater than the minimum display amount
    else {
      const stringAmount = ethers.utils.formatUnits(amount, baseDecimals)

      // if there isn't a decimal portion
      if (!stringAmount.match(/\./)) {
        return stringAmount
      }
      // if there is a decimal portion
      else {
        const [wholeComponent, decimalComponent] = stringAmount.split('.')
        const roundUpAmount = minimumDisplayAmount.div(ethers.constants.Two)
        const roundedDecimalComponent = ethers.utils
          .bigNumberify(decimalComponent.padEnd(baseDecimals, '0'))
          .add(roundUpAmount)
          .toString()
          .padStart(baseDecimals, '0')
          .substring(0, displayDecimals)

        // decimals are too small to show
        if (roundedDecimalComponent === '0'.repeat(displayDecimals)) {
          return wholeComponent
        }
        // decimals are not too small to show
        else {
          return `${wholeComponent}.${roundedDecimalComponent.toString().replace(/0*$/, '')}`
        }
      }
    }
  }
}

export function computeMarginalPrice(inputReserve, outputReserve, deltaX, inputTokenDecimals = 18, outputTokenDecimals = 18) {
  if (!inputReserve || !outputReserve || !deltaX) return ethers.constants.Zero

  // marginalPrice = (x * y * gamma)/(x + deltaX * gamma)^2
  //
  // where:
  //
  // x = amount of sell tokens in reserve before the trade = inputReserve
  // y = amount of buy tokens in reserve before the trade = outputReserve
  // gamma = 1 - fee (expressed as a fraction in [0,1])
  // deltaX = the amount of tokens being sold
  // marginalPrice = the price of the last unit bought

  const FEE_PRECISION_MULTIPLIER = 100000000
  const UNISWAP_FEE = 0.003
  const gamma = bigNumberify(FEE_PRECISION_MULTIPLIER).sub(bigNumberify(UNISWAP_FEE * FEE_PRECISION_MULTIPLIER))

  const TOKEN_PRECISION_MULTIPLIER = bigNumberify(10).pow(bigNumberify(Math.max(inputTokenDecimals, outputTokenDecimals)))
  inputReserve = inputReserve.mul(TOKEN_PRECISION_MULTIPLIER)
  outputReserve = outputReserve.mul(TOKEN_PRECISION_MULTIPLIER)

  inputTokenDecimals = bigNumberify(10).pow(bigNumberify(inputTokenDecimals))
  outputTokenDecimals = bigNumberify(10).pow(bigNumberify(outputTokenDecimals))
  inputReserve = inputReserve.div(inputTokenDecimals)
  outputReserve = outputReserve.div(outputTokenDecimals)

  const numerator = inputReserve
    .mul(outputReserve)
    .mul(gamma)
    .div(bigNumberify(FEE_PRECISION_MULTIPLIER))

  const denominator = inputReserve
    .add(
      deltaX.mul(gamma).div(bigNumberify(FEE_PRECISION_MULTIPLIER)))
    .pow(bigNumberify(2))

  const marginalPrice = numerator
    .mul(bigNumberify(FEE_PRECISION_MULTIPLIER))
    .div(denominator)
    .toString() / FEE_PRECISION_MULTIPLIER

  return marginalPrice
}

// this mocks the getInputPrice function, and calculates the required output
export function calculateEtherTokenOutputFromInput(inputAmount, inputReserve, outputReserve) {
  const inputAmountWithFee = inputAmount.mul(bigNumberify(997))
  const numerator = inputAmountWithFee.mul(outputReserve)
  const denominator = inputReserve.mul(bigNumberify(1000)).add(inputAmountWithFee)
  return numerator.div(denominator)
}

// this mocks the getOutputPrice function, and calculates the required input
export function calculateEtherTokenInputFromOutput(outputAmount, inputReserve, outputReserve) {
  const numerator = inputReserve.mul(outputAmount).mul(bigNumberify(1000))
  const denominator = outputReserve.sub(outputAmount).mul(bigNumberify(997))
  return numerator.div(denominator).add(ethers.constants.One)
}

export function computeRelativeMarginalPrice(
  inputTokenAmount,
  reserveTokenInput,
  reserveETHInput,
  reserveTokenOutput,
  reserveETHOutput,
  inputDecimals,
  outputDecimals
) {
  // Token-token exchanges use ether as the intermadiary currency.
  // So we use 18 decimal places for ETH for computing the marginal prices.
  const ETH_DECIMALS = 18
  const ethAmount = calculateEtherTokenOutputFromInput(inputTokenAmount, reserveTokenInput, reserveETHInput)
  const tokenInputMarginalPrice = computeMarginalPrice(reserveTokenInput, reserveETHInput, inputTokenAmount, inputDecimals, ETH_DECIMALS)
  const tokenOutputMarginalPrice = 1 / computeMarginalPrice(reserveETHOutput, reserveTokenOutput, ethAmount, ETH_DECIMALS, outputDecimals).toString()
  return tokenInputMarginalPrice.toString() / tokenOutputMarginalPrice
}
