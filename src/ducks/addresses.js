const KOVAN = {
  exchangeAddresses: {
    addresses: [],
    fromToken: {}
  },
  factoryAddress: '0xd241d462b179d46bff63a6d50bec5166deabfe07',
  tokenAddresses: {
    addresses: []
  }
}

const MAIN = {
  exchangeAddresses: {
    addresses: [],
    fromToken: {}
  },
  factoryAddress: '0xc0a47dFe034B400B47bDaD5FecDa2621de6c4d95',
  tokenAddresses: {
    addresses: []
  }
}

const SET_ADDRESSES = 'app/addresses/setAddresses'
const ADD_EXCHANGE = 'app/addresses/addExchange'

const initialState = KOVAN

export const addExchange = ({ exchangeAddress, label, tokenAddress }) => (
  dispatch,
  getState
) => {
  const {
    addresses: { exchangeAddresses, tokenAddresses }
  } = getState()

  if (
    tokenAddresses.addresses.filter(([symbol]) => symbol === label).length > 0
  )
    return

  if (exchangeAddresses.fromToken[tokenAddresses]) return

  dispatch({
    payload: {
      exchangeAddress,
      label,
      tokenAddress
    },
    type: ADD_EXCHANGE
  })
}

export const setAddresses = networkId => {
  switch (networkId) {
    // Main Net
    case 1:
    case '1':
      return {
        payload: MAIN,
        type: SET_ADDRESSES
      }
    // Kovan
    case 4:
    case '4':
    default:
      return {
        payload: KOVAN,
        type: SET_ADDRESSES
      }
  }
}

export default (state = initialState, { payload, type }) => {
  switch (type) {
    case SET_ADDRESSES:
      return payload
    case ADD_EXCHANGE:
      return handleAddExchange(state, { payload })
    default:
      return state
  }
}

const handleAddExchange = (state, { payload }) => {
  const { exchangeAddress, label, tokenAddress } = payload

  if (!label || !tokenAddress || !exchangeAddress) return state

  return {
    ...state,
    exchangeAddresses: {
      ...state.exchangeAddresses,
      addresses: [
        ...state.exchangeAddresses.addresses,
        [label, exchangeAddress]
      ],
      fromToken: {
        ...state.exchangeAddresses.fromToken,
        [tokenAddress]: exchangeAddress
      }
    },
    tokenAddresses: {
      ...state.tokenAddresses,
      addresses: [...state.tokenAddresses.addresses, [label, tokenAddress]]
    }
  }
}
