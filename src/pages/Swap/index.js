import React, { useState, useReducer, useEffect } from 'react'
import ReactGA from 'react-ga'
import { useTranslation } from 'react-i18next'
import { useWeb3Context } from 'web3-react'
import { ethers } from 'ethers'
import styled from 'styled-components'

import { Button, Spinner } from '../../theme'
import CurrencyInputPanel from '../../components/CurrencyInputPanel'
import NewContextualInfo from '../../components/ContextualInfoNew'
import OversizedPanel from '../../components/OversizedPanel'
import ArrowDownBlue from '../../assets/images/arrow-down-blue.svg'
import ArrowDownGrey from '../../assets/images/arrow-down-grey.svg'
import Circle from '../../assets/images/circle.svg'
import {
  amountFormatter,
  calculateGasMargin,
  computeMarginalPrice,
  computeRelativeMarginalPrice,
  calculateEtherTokenOutputFromInput,
  calculateEtherTokenInputFromOutput
} from '../../utils'
import { useExchangeContract } from '../../hooks'
import { useTokenDetails } from '../../contexts/Tokens'
import { useTransactionAdder } from '../../contexts/Transactions'
import { useAddressBalance, useExchangeReserves } from '../../contexts/Balances'
import { useAddressAllowance } from '../../contexts/Allowances'

const INPUT = 0
const OUTPUT = 1

const ETH_TO_TOKEN = 0
const TOKEN_TO_ETH = 1
const TOKEN_TO_TOKEN = 2

// denominated in bips
const ALLOWED_SLIPPAGE = ethers.utils.bigNumberify(200)
const TOKEN_ALLOWED_SLIPPAGE = ethers.utils.bigNumberify(400)

// denominated in seconds
const DEADLINE_FROM_NOW = 60 * 15

// denominated in bips
const GAS_MARGIN = ethers.utils.bigNumberify(1000)

const BlueSpan = styled.span`
  color: ${({ theme }) => theme.royalBlue};
`

const LastSummaryText = styled.div`
  margin-top: 1rem;
`

const DownArrowBackground = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  justify-content: center;
  align-items: center;
`

const DownArrow = styled.img`
  width: 0.625rem;
  height: 0.625rem;
  position: relative;
  padding: 0.875rem;
  cursor: ${({ clickable }) => clickable && 'pointer'};
`

const ExchangeRateWrapper = styled.div`
  ${({ theme }) => theme.flexRowNoWrap};
  align-items: center;
  color: ${({ theme }) => theme.doveGray};
  font-size: 0.75rem;
  padding: 0.5rem 1rem;
  cursor: pointer;
`

const ExchangeRate = styled.span`
  flex: 1 1 auto;
  width: 0;
  color: ${({ theme }) => theme.chaliceGray};
`

const Flex = styled.div`
  display: flex;
  justify-content: center;
  padding: 2rem;

  button {
    max-width: 20rem;
  }
`

const SpinnerWrapper = styled(Spinner)`
  margin: 0 0.25rem 0 0.25rem;
`

function calculateSlippageBounds(value, token = false) {
  if (value) {
    const offset = value.mul(token ? TOKEN_ALLOWED_SLIPPAGE : ALLOWED_SLIPPAGE).div(ethers.utils.bigNumberify(10000))
    const minimum = value.sub(offset)
    const maximum = value.add(offset)
    return {
      minimum: minimum.lt(ethers.constants.Zero) ? ethers.constants.Zero : minimum,
      maximum: maximum.gt(ethers.constants.MaxUint256) ? ethers.constants.MaxUint256 : maximum
    }
  } else {
    return {}
  }
}

function getSwapType(inputCurrency, outputCurrency) {
  if (!inputCurrency || !outputCurrency) {
    return null
  } else if (inputCurrency === 'ETH') {
    return ETH_TO_TOKEN
  } else if (outputCurrency === 'ETH') {
    return TOKEN_TO_ETH
  } else {
    return TOKEN_TO_TOKEN
  }
}

function getInitialSwapState(outputCurrency) {
  return {
    independentValue: '', // this is a user input
    dependentValue: '', // this is a calculated number
    independentField: INPUT,
    inputCurrency: 'ETH',
    outputCurrency: outputCurrency ? outputCurrency : ''
  }
}

function swapStateReducer(state, action) {
  switch (action.type) {
    case 'FLIP_INDEPENDENT': {
      const { independentField, inputCurrency, outputCurrency } = state
      return {
        ...state,
        dependentValue: '',
        independentField: independentField === INPUT ? OUTPUT : INPUT,
        inputCurrency: outputCurrency,
        outputCurrency: inputCurrency
      }
    }
    case 'SELECT_CURRENCY': {
      const { inputCurrency, outputCurrency } = state
      const { field, currency } = action.payload

      const newInputCurrency = field === INPUT ? currency : inputCurrency
      const newOutputCurrency = field === OUTPUT ? currency : outputCurrency

      if (newInputCurrency === newOutputCurrency) {
        return {
          ...state,
          inputCurrency: field === INPUT ? currency : '',
          outputCurrency: field === OUTPUT ? currency : ''
        }
      } else {
        return {
          ...state,
          inputCurrency: newInputCurrency,
          outputCurrency: newOutputCurrency
        }
      }
    }
    case 'UPDATE_INDEPENDENT': {
      const { field, value } = action.payload
      const { dependentValue, independentValue } = state
      return {
        ...state,
        independentValue: value,
        dependentValue: value === independentValue ? dependentValue : '',
        independentField: field
      }
    }
    case 'UPDATE_DEPENDENT': {
      return {
        ...state,
        dependentValue: action.payload
      }
    }
    case 'UPDATING_RATE': {
      return {
        ...state,
        updatingRate: action.payload
      }
    }
    default: {
      return getInitialSwapState()
    }
  }
}

function getExchangeRate(inputValue, inputDecimals, outputValue, outputDecimals, invert = false) {
  try {
    if (
      inputValue &&
      (inputDecimals || inputDecimals === 0) &&
      outputValue &&
      (outputDecimals || outputDecimals === 0)
    ) {
      const factor = ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18))

      if (invert) {
        return inputValue
          .mul(factor)
          .div(outputValue)
          .mul(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(outputDecimals)))
          .div(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(inputDecimals)))
      } else {
        return outputValue
          .mul(factor)
          .div(inputValue)
          .mul(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(inputDecimals)))
          .div(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(outputDecimals)))
      }
    }
  } catch {}
}

function getMarketRate(
  swapType,
  inputReserveETH,
  inputReserveToken,
  inputDecimals,
  outputReserveETH,
  outputReserveToken,
  outputDecimals,
  invert = false
) {
  if (swapType === ETH_TO_TOKEN) {
    return getExchangeRate(outputReserveETH, 18, outputReserveToken, outputDecimals, invert)
  } else if (swapType === TOKEN_TO_ETH) {
    return getExchangeRate(inputReserveToken, inputDecimals, inputReserveETH, 18, invert)
  } else if (swapType === TOKEN_TO_TOKEN) {
    const factor = ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18))
    const firstRate = getExchangeRate(inputReserveToken, inputDecimals, inputReserveETH, 18)
    const secondRate = getExchangeRate(outputReserveETH, 18, outputReserveToken, outputDecimals)
    try {
      return !!(firstRate && secondRate) ? firstRate.mul(secondRate).div(factor) : undefined
    } catch {}
  }
}

export default function Swap({ initialCurrency }) {
  const { t } = useTranslation()
  const { account } = useWeb3Context()

  const addTransaction = useTransactionAdder()

  // analytics
  useEffect(() => {
    ReactGA.pageview(window.location.pathname + window.location.search)
  }, [])

  // core swap state
  const [swapState, dispatchSwapState] = useReducer(swapStateReducer, initialCurrency, getInitialSwapState)
  const { independentValue, dependentValue, independentField, inputCurrency, outputCurrency } = swapState

  // get swap type from the currency types
  const swapType = getSwapType(inputCurrency, outputCurrency)

  // get decimals and exchange addressfor each of the currency types
  const { symbol: inputSymbol, decimals: inputDecimals, exchangeAddress: inputExchangeAddress, missingDecimals: missingDecimalsInput } = useTokenDetails(
    inputCurrency
  )
  const { symbol: outputSymbol, decimals: outputDecimals, exchangeAddress: outputExchangeAddress, missingDecimals: missingDecimalsOutput } = useTokenDetails(
    outputCurrency
  )

  const inputExchangeContract = useExchangeContract(inputExchangeAddress)
  const outputExchangeContract = useExchangeContract(outputExchangeAddress)
  const contract = swapType === ETH_TO_TOKEN ? outputExchangeContract : inputExchangeContract

  // get input allowance
  const inputAllowance = useAddressAllowance(account, inputCurrency, inputExchangeAddress)

  // fetch reserves for each of the currency types
  const { reserveETH: inputReserveETH, reserveToken: inputReserveToken } = useExchangeReserves(inputCurrency)
  const { reserveETH: outputReserveETH, reserveToken: outputReserveToken } = useExchangeReserves(outputCurrency)

  // get balances for each of the currency types
  const inputBalance = useAddressBalance(account, inputCurrency)
  const outputBalance = useAddressBalance(account, outputCurrency)
  const inputBalanceFormatted = !!(inputBalance && Number.isInteger(inputDecimals))
    ? amountFormatter(inputBalance, inputDecimals, Math.min(4, inputDecimals))
    : ''
  const outputBalanceFormatted = !!(outputBalance && Number.isInteger(outputDecimals))
    ? amountFormatter(outputBalance, outputDecimals, Math.min(4, outputDecimals))
    : ''

  // compute useful transforms of the data above
  const independentDecimals = independentField === INPUT ? inputDecimals : outputDecimals
  const dependentDecimals = independentField === OUTPUT ? inputDecimals : outputDecimals

  // declare/get parsed and formatted versions of input/output values
  const [independentValueParsed, setIndependentValueParsed] = useState()
  const dependentValueFormatted = !!(dependentValue && (dependentDecimals || dependentDecimals === 0))
    ? amountFormatter(dependentValue, dependentDecimals, Math.min(4, dependentDecimals), false)
    : ''
  const inputValueParsed = independentField === INPUT ? independentValueParsed : dependentValue
  const inputValueFormatted = independentField === INPUT ? independentValue : dependentValueFormatted
  const outputValueParsed = independentField === OUTPUT ? independentValueParsed : dependentValue
  const outputValueFormatted = independentField === OUTPUT ? independentValue : dependentValueFormatted

  // validate + parse independent value
  const [independentError, setIndependentError] = useState()
  useEffect(() => {
    if (independentValue && (independentDecimals || independentDecimals === 0)) {
      try {
        const parsedValue = ethers.utils.parseUnits(independentValue, independentDecimals)

        if (parsedValue.lte(ethers.constants.Zero) || parsedValue.gte(ethers.constants.MaxUint256)) {
          throw Error()
        } else {
          setIndependentValueParsed(parsedValue)
          setIndependentError(null)
        }
      } catch {
        setIndependentError(t('inputNotValid'))
      }

      return () => {
        setIndependentValueParsed()
        setIndependentError()
      }
    }
  }, [independentValue, independentDecimals, t])

  // calculate slippage from target rate
  const { minimum: dependentValueMinumum, maximum: dependentValueMaximum } = calculateSlippageBounds(
    dependentValue,
    swapType === TOKEN_TO_TOKEN
  )

  // validate input allowance + balance
  const [inputError, setInputError] = useState()
  const [showUnlock, setShowUnlock] = useState(false)
  useEffect(() => {
    const inputValueCalculation = independentField === INPUT ? independentValueParsed : dependentValueMaximum
    if (inputBalance && (inputAllowance || inputCurrency === 'ETH') && inputValueCalculation) {
      if (!independentDecimals || !dependentDecimals) {
        setInputError(<SpinnerWrapper src={Circle} alt="loader" />)
      } else if (inputBalance.lt(inputValueCalculation) && independentDecimals && dependentDecimals) {
        setInputError(t('insufficientBalance'))
      } else if (inputCurrency !== 'ETH' && inputAllowance.lt(inputValueCalculation)) {
        setInputError(t('unlockTokenCont'))
        setShowUnlock(true)
      } else {
        setInputError(null)
        setShowUnlock(false)
      }

      return () => {
        setInputError()
        setShowUnlock(false)
      }
    }
  }, [
    independentField,
    independentValueParsed,
    dependentValueMaximum,
    inputBalance,
    inputCurrency,
    inputAllowance,
    t,
    dependentDecimals,
    independentDecimals
  ])

  const [tokenReservesInput, setTokenReservesInput] = useState()
  const [tokenReservesOutput, setTokenReservesOutput] = useState()
  const [reserveETHInput, setReserveETHInput] = useState()
  const [reserveETHOutput, setReserveETHOutput] = useState()

  // calculate dependent value
  useEffect(() => {
    const amount = independentValueParsed

    if (missingDecimalsInput || missingDecimalsOutput) {
      setIndependentError(t('missingDecimalPlaces'))
      dispatchSwapState({ type: 'UPDATE_DEPENDENT', payload: '' })
    } else if (swapType === ETH_TO_TOKEN) {
      const reserveETH = outputReserveETH
      const reserveToken = outputReserveToken
      setTokenReservesInput(reserveETH)
      setTokenReservesOutput(reserveToken)

      if (amount && reserveETH && reserveToken) {
        if (reserveETH.eq(ethers.utils.bigNumberify(0)) || reserveToken.eq(ethers.utils.bigNumberify(0))){
          setIndependentError(t('insufficientLiquidity'))
        } else {
          try {
            const calculatedDependentValue =
              independentField === INPUT
                ? calculateEtherTokenOutputFromInput(amount, reserveETH, reserveToken)
                : calculateEtherTokenInputFromOutput(amount, reserveETH, reserveToken)

            if (calculatedDependentValue.lte(ethers.constants.Zero)) {
              throw Error()
            }

            dispatchSwapState({ type: 'UPDATE_DEPENDENT', payload: calculatedDependentValue })
          } catch {
            setIndependentError(t('insufficientLiquidity'))
          }
        }
        return () => {
          dispatchSwapState({ type: 'UPDATE_DEPENDENT', payload: '' })
        }
      }
    } else if (swapType === TOKEN_TO_ETH) {
      const reserveETH = inputReserveETH
      const reserveToken = inputReserveToken
      setTokenReservesOutput(reserveETH)
      setTokenReservesInput(reserveToken)

      if (amount && reserveETH && reserveToken) {
        try {
          const calculatedDependentValue =
            independentField === INPUT
              ? calculateEtherTokenOutputFromInput(amount, reserveToken, reserveETH)
              : calculateEtherTokenInputFromOutput(amount, reserveToken, reserveETH)

          if (calculatedDependentValue.lte(ethers.constants.Zero)) {
            throw Error()
          }

          dispatchSwapState({ type: 'UPDATE_DEPENDENT', payload: calculatedDependentValue })
        } catch {
          setIndependentError(t('insufficientLiquidity'))
        }
        return () => {
          dispatchSwapState({ type: 'UPDATE_DEPENDENT', payload: '' })
        }
      }
    } else if (swapType === TOKEN_TO_TOKEN) {
      const reserveETHFirst = inputReserveETH
      const reserveTokenFirst = inputReserveToken

      const reserveETHSecond = outputReserveETH
      const reserveTokenSecond = outputReserveToken

      setTokenReservesInput(inputReserveToken)
      setReserveETHInput(inputReserveETH)
      setTokenReservesOutput(outputReserveToken)
      setReserveETHOutput(outputReserveETH)

      if (amount && reserveETHFirst && reserveTokenFirst && reserveETHSecond && reserveTokenSecond) {
        try {
          if (independentField === INPUT) {
            const intermediateValue = calculateEtherTokenOutputFromInput(amount, reserveTokenFirst, reserveETHFirst)
            if (intermediateValue.lte(ethers.constants.Zero)) {
              throw Error()
            }
            const calculatedDependentValue = calculateEtherTokenOutputFromInput(
              intermediateValue,
              reserveETHSecond,
              reserveTokenSecond
            )
            if (calculatedDependentValue.lte(ethers.constants.Zero)) {
              throw Error()
            }
            dispatchSwapState({ type: 'UPDATE_DEPENDENT', payload: calculatedDependentValue })
          } else {
            const intermediateValue = calculateEtherTokenInputFromOutput(amount, reserveETHSecond, reserveTokenSecond)
            if (intermediateValue.lte(ethers.constants.Zero)) {
              throw Error()
            }
            const calculatedDependentValue = calculateEtherTokenInputFromOutput(
              intermediateValue,
              reserveTokenFirst,
              reserveETHFirst
            )
            if (calculatedDependentValue.lte(ethers.constants.Zero)) {
              throw Error()
            }
            dispatchSwapState({ type: 'UPDATE_DEPENDENT', payload: calculatedDependentValue })
          }
        } catch (err) {
          console.error(err)
          setIndependentError(t('insufficientLiquidity'))
        }
        return () => {
          dispatchSwapState({ type: 'UPDATE_DEPENDENT', payload: '' })
        }
      }
    }
  }, [
    independentValueParsed,
    swapType,
    outputReserveETH,
    outputReserveToken,
    inputReserveETH,
    inputReserveToken,
    independentField,
    t,
    inputCurrency,
    outputCurrency,
    missingDecimalsInput,
    missingDecimalsOutput
  ])

  const [inverted, setInverted] = useState(false)
  const exchangeRate = getExchangeRate(inputValueParsed, inputDecimals, outputValueParsed, outputDecimals)
  const exchangeRateInverted = getExchangeRate(inputValueParsed, inputDecimals, outputValueParsed, outputDecimals, true)

  const marketRate = getMarketRate(
    swapType,
    inputReserveETH,
    inputReserveToken,
    inputDecimals,
    outputReserveETH,
    outputReserveToken,
    outputDecimals
  )

  const percentSlippage =
    exchangeRate && marketRate
      ? exchangeRate
          .sub(marketRate)
          .abs()
          .mul(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18)))
          .div(marketRate)
          .sub(ethers.utils.bigNumberify(3).mul(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(15))))
      : undefined
  const percentSlippageFormatted = percentSlippage && amountFormatter(percentSlippage, 16, 2)
  const slippageWarning =
    percentSlippage &&
    percentSlippage.gte(ethers.utils.parseEther('.05')) &&
    percentSlippage.lt(ethers.utils.parseEther('.2')) // [5% - 20%)
  const highSlippageWarning = percentSlippage && percentSlippage.gte(ethers.utils.parseEther('.2')) // [20+%

  const isValid = exchangeRate && inputError === null && independentError === null && !missingDecimalsInput && !missingDecimalsOutput

  const estimatedText = `(${t('estimated')})`
  function formatBalance(value) {
    return `Balance: ${value}`
  }

  const [invertedMarginalPrice, setInvertedMarginalPrice] = useState(false)

  function renderTransactionDetails() {
    ReactGA.event({
      category: 'TransactionDetail',
      action: 'Open'
    })

    const b = text => <BlueSpan>{text}</BlueSpan>

    let marginalPriceDisplay = ' - '
    if (tokenReservesInput.eq(ethers.utils.bigNumberify('0')) || tokenReservesOutput.eq(ethers.utils.bigNumberify('0')))
      return marginalPriceDisplay

    if (tokenReservesInput && tokenReservesOutput && inputValueParsed && outputValueParsed)
      if (swapType === ETH_TO_TOKEN || swapType === TOKEN_TO_ETH) {
        const marginalPrice = computeMarginalPrice(tokenReservesInput, tokenReservesOutput, inputValueParsed, inputDecimals, outputDecimals)
        if (swapType === ETH_TO_TOKEN)
          marginalPriceDisplay = `1 ${invertedMarginalPrice ? inputSymbol : outputSymbol} = ${
            invertedMarginalPrice ? marginalPrice.toFixed(7) : (1 / marginalPrice).toFixed(7)
          } ${invertedMarginalPrice ? outputSymbol : inputSymbol}`
        else
          marginalPriceDisplay = `1 ${invertedMarginalPrice ? outputSymbol : inputSymbol} = ${
            invertedMarginalPrice ? (1 / marginalPrice).toFixed(7) : marginalPrice.toFixed(7)
          } ${invertedMarginalPrice ? inputSymbol : outputSymbol}`
      } else if (reserveETHOutput && reserveETHInput) {
        const marginalPrice = computeRelativeMarginalPrice(
          inputValueParsed,
          tokenReservesInput,
          reserveETHInput,
          tokenReservesOutput,
          reserveETHOutput,
          inputDecimals,
          outputDecimals
        )
        marginalPriceDisplay = `1 ${invertedMarginalPrice ? inputSymbol : outputSymbol} = ${
          invertedMarginalPrice ? marginalPrice.toFixed(7) : (1 / marginalPrice).toFixed(7)
        } ${invertedMarginalPrice ? outputSymbol : inputSymbol}`
      }

    marginalPriceDisplay = (
      <span onClick={() => setInvertedMarginalPrice(!invertedMarginalPrice)}>{marginalPriceDisplay}</span>
    )

    if (!dependentDecimals || !independentDecimals) return <div>-</div>

    if (independentField === INPUT) {
      return (
        <div>
          <div>
            {t('youAreSelling')}{' '}
            {b(
              `${amountFormatter(
                independentValueParsed,
                independentDecimals,
                Math.min(4, independentDecimals)
              )} ${inputSymbol}`
            )}
            .
          </div>
          <LastSummaryText>
            {t('youWillReceive')}{' '}
            {b(
              `${amountFormatter(
                dependentValueMinumum,
                dependentDecimals,
                Math.min(4, dependentDecimals)
              )} ${outputSymbol}`
            )}{' '}
          </LastSummaryText>
          <LastSummaryText>
            {(slippageWarning || highSlippageWarning) && (
              <span role="img" aria-label="warning">
                ⚠️
              </span>
            )}
            {t('priceChange')} {b(`${percentSlippageFormatted}%`)}.
          </LastSummaryText>
          <LastSummaryText>
            {t('marginalPrice')}
            {': '}
            {b(marginalPriceDisplay)}.
          </LastSummaryText>
        </div>
      )
    } else {
      return (
        <div>
          <div>
            {t('youAreBuying')}{' '}
            {b(
              `${amountFormatter(
                independentValueParsed,
                independentDecimals,
                Math.min(4, independentDecimals)
              )} ${outputSymbol}`
            )}
            .
          </div>
          <LastSummaryText>
            {t('itWillCost')}{' '}
            {b(
              `${amountFormatter(
                dependentValueMaximum,
                dependentDecimals,
                Math.min(4, dependentDecimals)
              )} ${inputSymbol}`
            )}{' '}
            {t('orTransFail')}
          </LastSummaryText>
          <LastSummaryText>
            {t('priceChange')} {b(`${percentSlippageFormatted}%`)}.
          </LastSummaryText>
          <LastSummaryText>
            {t('marginalPrice')}
            {': '}
            {b(marginalPriceDisplay)}.
          </LastSummaryText>
        </div>
      )
    }
  }

  function renderSummary() {
    let contextualInfo = ''
    let isError = false

    if (inputError || independentError) {
      contextualInfo = inputError || independentError
      isError = true
    } else if (!inputCurrency || !outputCurrency) {
      contextualInfo = t('selectTokenCont')
    } else if (!independentValue) {
      contextualInfo = t('enterValueCont')
    } else if (!independentDecimals || !dependentDecimals) {
      contextualInfo = <SpinnerWrapper src={Circle} alt="loader" />
    } else if (!account) {
      contextualInfo = t('noWallet')
      isError = true
    }

    const slippageWarningText = highSlippageWarning
      ? t('highSlippageWarning')
      : slippageWarning
      ? t('slippageWarning')
      : ''

    return (
      <NewContextualInfo
        openDetailsText={t('transactionDetails')}
        closeDetailsText={t('hideDetails')}
        contextualInfo={contextualInfo ? contextualInfo : slippageWarningText}
        allowExpand={!!(inputCurrency && outputCurrency && inputValueParsed && outputValueParsed)}
        isError={isError}
        slippageWarning={slippageWarning && !contextualInfo}
        highSlippageWarning={highSlippageWarning && !contextualInfo}
        renderTransactionDetails={renderTransactionDetails}
      />
    )
  }

  async function onSwap() {
    const deadline = Math.ceil(Date.now() / 1000) + DEADLINE_FROM_NOW

    let estimate, method, args, value
    if (independentField === INPUT) {
      ReactGA.event({
        category: `${swapType}`,
        action: 'SwapInput'
      })

      if (swapType === ETH_TO_TOKEN) {
        estimate = contract.estimate.ethToTokenSwapInput
        method = contract.ethToTokenSwapInput
        args = [dependentValueMinumum, deadline]
        value = independentValueParsed
      } else if (swapType === TOKEN_TO_ETH) {
        estimate = contract.estimate.tokenToEthSwapInput
        method = contract.tokenToEthSwapInput
        args = [independentValueParsed, dependentValueMinumum, deadline]
        value = ethers.constants.Zero
      } else if (swapType === TOKEN_TO_TOKEN) {
        estimate = contract.estimate.tokenToTokenSwapInput
        method = contract.tokenToTokenSwapInput
        args = [independentValueParsed, dependentValueMinumum, ethers.constants.One, deadline, outputCurrency]
        value = ethers.constants.Zero
      }
    } else if (independentField === OUTPUT) {
      ReactGA.event({
        category: `${swapType}`,
        action: 'SwapOutput'
      })

      if (swapType === ETH_TO_TOKEN) {
        estimate = contract.estimate.ethToTokenSwapOutput
        method = contract.ethToTokenSwapOutput
        args = [independentValueParsed, deadline]
        value = dependentValueMaximum
      } else if (swapType === TOKEN_TO_ETH) {
        estimate = contract.estimate.tokenToEthSwapOutput
        method = contract.tokenToEthSwapOutput
        args = [independentValueParsed, dependentValueMaximum, deadline]
        value = ethers.constants.Zero
      } else if (swapType === TOKEN_TO_TOKEN) {
        estimate = contract.estimate.tokenToTokenSwapOutput
        method = contract.tokenToTokenSwapOutput
        args = [independentValueParsed, dependentValueMaximum, ethers.constants.MaxUint256, deadline, outputCurrency]
        value = ethers.constants.Zero
      }
    }

    const estimatedGasLimit = await estimate(...args, { value })
    method(...args, { value, gasLimit: calculateGasMargin(estimatedGasLimit, GAS_MARGIN) }).then(response => {
      addTransaction(response)
    })
  }

  return (
    <>
      <CurrencyInputPanel
        title={t('input')}
        description={inputValueFormatted && independentField === OUTPUT ? estimatedText : ''}
        extraText={inputBalanceFormatted && formatBalance(inputBalanceFormatted)}
        extraTextClickHander={() => {
          if (inputBalance && inputDecimals) {
            const valueToSet = inputCurrency === 'ETH' ? inputBalance.sub(ethers.utils.parseEther('.1')) : inputBalance
            if (valueToSet.gt(ethers.constants.Zero)) {
              dispatchSwapState({
                type: 'UPDATE_INDEPENDENT',
                payload: { value: amountFormatter(valueToSet, inputDecimals, inputDecimals, false), field: INPUT }
              })
            }
          }
        }}
        onCurrencySelected={inputCurrency => {
          dispatchSwapState({ type: 'SELECT_CURRENCY', payload: { currency: inputCurrency, field: INPUT } })
        }}
        onValueChange={inputValue => {
          dispatchSwapState({ type: 'UPDATE_INDEPENDENT', payload: { value: inputValue, field: INPUT } })
        }}
        showUnlock={showUnlock}
        selectedTokens={[inputCurrency, outputCurrency]}
        selectedTokenAddress={inputCurrency}
        value={inputValueFormatted}
        errorMessage={inputError ? inputError : independentField === INPUT ? independentError : ''}
      />
      <OversizedPanel>
        <DownArrowBackground>
          <DownArrow
            onClick={() => {
              dispatchSwapState({ type: 'FLIP_INDEPENDENT' })
            }}
            clickable
            alt="swap"
            src={isValid ? ArrowDownBlue : ArrowDownGrey}
          />
        </DownArrowBackground>
      </OversizedPanel>
      <CurrencyInputPanel
        title={t('output')}
        description={outputValueFormatted && independentField === INPUT ? estimatedText : ''}
        extraText={outputBalanceFormatted && formatBalance(outputBalanceFormatted)}
        onCurrencySelected={outputCurrency => {
          dispatchSwapState({ type: 'SELECT_CURRENCY', payload: { currency: outputCurrency, field: OUTPUT } })
        }}
        onValueChange={outputValue => {
          dispatchSwapState({ type: 'UPDATE_INDEPENDENT', payload: { value: outputValue, field: OUTPUT } })
        }}
        selectedTokens={[inputCurrency, outputCurrency]}
        selectedTokenAddress={outputCurrency}
        value={outputValueFormatted}
        errorMessage={independentField === OUTPUT ? independentError : ''}
        disableUnlock
      />
      <OversizedPanel hideBottom>
        <ExchangeRateWrapper
          onClick={() => {
            setInverted(!inverted)
          }}
        >
          <ExchangeRate>{t('exchangeRate')}</ExchangeRate>
          {swapType === ETH_TO_TOKEN || swapType === TOKEN_TO_TOKEN ? (
            <span>
              {exchangeRate
                ? inverted
                  ? `1 ${inputSymbol} = ${amountFormatter(exchangeRate, 18, 4, false)} ${outputSymbol}`
                  : `1 ${outputSymbol} = ${amountFormatter(exchangeRateInverted, 18, 4, false)} ${inputSymbol}`
                : ' - '}
            </span>
          ) : (
            <span>
              {exchangeRate
                ? inverted
                  ? `1 ${outputSymbol} = ${amountFormatter(exchangeRateInverted, 18, 4, false)} ${inputSymbol}`
                  : `1 ${inputSymbol} = ${amountFormatter(exchangeRate, 18, 4, false)} ${outputSymbol}`
                : ' - '}
            </span>
          )}
        </ExchangeRateWrapper>
      </OversizedPanel>
      {renderSummary()}
      <Flex>
        <Button disabled={!isValid} onClick={onSwap} warning={highSlippageWarning}>
          {highSlippageWarning ? t('swapAnyway') : t('swap')}
        </Button>
      </Flex>
    </>
  )
}
