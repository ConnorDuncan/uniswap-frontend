const AAVE_LIST = 'tokenlist.aave.eth'
const CMC_ALL_LIST = 'defi.cmc.eth'
const CMC_STABLECOIN = 'stablecoin.cmc.eth'
const COINGECKO_LIST = 'https://tokens.coingecko.com/uniswap/all.json'
const COMPOUND_LIST = 'https://raw.githubusercontent.com/compound-finance/token-list/master/compound.tokenlist.json'
const GEMINI_LIST = 'https://www.gemini.com/uniswap/manifest.json'
const KLEROS_LIST = 't2crtokens.eth'
const ZAPPERFI_LIST = 'https://zapper.fi/api/token-list'
const MYCRYPTO_LIST = 'https://uniswap.mycryptoapi.com/'
const UNISWAP_DEFAULT_LIST = 'https://gateway.ipfs.io/ipns/tokens.uniswap.org'
export const OPTIMISM_LIST = 'https://static.optimism.io/optimism.tokenlist.json'
const ROLL_LIST = 'https://app.tryroll.com/tokens.json'
const SET_LIST = 'https://raw.githubusercontent.com/SetProtocol/uniswap-tokenlist/main/set.tokenlist.json'
const WRAPPED_LIST = 'wrapped.tokensoft.eth'

// only load blocked list if on app url
export const UNSUPPORTED_LIST_URLS: string[] = []

// lower index == higher priority for token import
export const DEFAULT_LIST_OF_LISTS: string[] = [
  COMPOUND_LIST,
  AAVE_LIST,
  CMC_ALL_LIST,
  CMC_STABLECOIN,
  WRAPPED_LIST,
  SET_LIST,
  ROLL_LIST,
  COINGECKO_LIST,
  KLEROS_LIST,
  OPTIMISM_LIST,
  GEMINI_LIST,
  ZAPPERFI_LIST,
  MYCRYPTO_LIST,
  UNISWAP_DEFAULT_LIST,
  ...UNSUPPORTED_LIST_URLS, // need to load unsupported tokens as well
]

// default lists to be 'active' aka searched across
export const DEFAULT_ACTIVE_LIST_URLS: string[] = [KLEROS_LIST]
