import React, { Component } from 'react'
import { connect } from 'react-redux'
import PropTypes from 'prop-types'
import { CSSTransitionGroup } from 'react-transition-group'
import classnames from 'classnames'
import { withRouter } from 'react-router-dom'
import { withNamespaces } from 'react-i18next'
import Fuse from '../../helpers/fuse'
import Modal from '../Modal'
import TokenLogo from '../TokenLogo'
import SearchIcon from '../../assets/images/magnifying-glass.svg'
import { selectors, addPendingTx } from '../../ducks/web3connect'
import { addApprovalTx } from '../../ducks/pending'
import { addExchange } from '../../ducks/addresses'
import { BigNumber as BN } from 'bignumber.js'
import getT2CRtoken from '../../helpers/get-t2cr-token'

import './currency-panel.scss'

import ERC20_ABI from '../../abi/erc20'
import FACTORY_ABI from '../../abi/factory'

const FUSE_OPTIONS = {
  includeMatches: false,
  threshold: 0.0,
  tokenize: true,
  location: 0,
  distance: 100,
  maxPatternLength: 45,
  minMatchCharLength: 1,
  keys: [
    { name: 'address', weight: 0.8 },
    { name: 'label', weight: 0.5 },
    { name: 'name', weight: 0.5 }
  ]
}

const TOKEN_ADDRESS_TO_LABEL = { ETH: 'ETH' }

class CurrencyInputPanel extends Component {
  static propTypes = {
    title: PropTypes.string,
    description: PropTypes.string,
    extraText: PropTypes.string,
    value: PropTypes.string,
    onCurrencySelected: PropTypes.func,
    onValueChange: PropTypes.func,
    tokenAddresses: PropTypes.shape({
      addresses: PropTypes.array.isRequired
    }).isRequired,
    exchangeAddresses: PropTypes.shape({
      fromToken: PropTypes.object.isRequired
    }).isRequired,
    factoryAddress: PropTypes.string,
    selectedTokens: PropTypes.array.isRequired,
    errorMessage: PropTypes.string,
    account: PropTypes.string,
    selectedTokenAddress: PropTypes.string,
    disableTokenSelect: PropTypes.bool,
    selectors: PropTypes.func.isRequired,
    addExchange: PropTypes.func.isRequired,
    filteredTokens: PropTypes.arrayOf(PropTypes.string),
    disableUnlock: PropTypes.bool,
    renderInput: PropTypes.func
  }

  static defaultProps = {
    selectedTokens: [],
    filteredTokens: [],
    onCurrencySelected() {},
    onValueChange() {},
    selectedTokenAddress: ''
  }

  state = {
    isShowingModal: false,
    searchQuery: '',
    loadingExchange: false
  }

  createTokenList = extraToken => {
    const { filteredTokens } = this.props
    let tokens = this.props.tokenAddresses.addresses
    let tokenList = [
      { value: 'ETH', label: 'ETH', address: 'ETH', name: 'Ether' }
    ]

    for (let i = 0; i < tokens.length; i++) {
      let entry = { value: '', label: '' }
      entry.value = tokens[i][0]
      entry.label = tokens[i][0]
      entry.address = tokens[i][1]
      entry.name = tokens[i][2]
      entry.symbolMultihash = tokens[i][3]
      tokenList.push(entry)
      TOKEN_ADDRESS_TO_LABEL[tokens[i][1]] = tokens[i][0]
    }

    return tokenList.filter(({ address }) => !filteredTokens.includes(address))
  }

  onTokenSelect = async address => {
    const {
      addExchange,
      exchangeAddresses: { fromToken },
      factoryAddress,
      history,
      onCurrencySelected,
      web3,
      networkId
    } = this.props

    this.setState({
      searchQuery: ''
    })

    if (!fromToken[address] && address !== 'ETH') {
      const factory = new web3.eth.Contract(FACTORY_ABI, factoryAddress)
      this.setState({ loadingExchange: true })
      factory.methods.getExchange(address).call((err, data) => {
        if (err || data === '0x0000000000000000000000000000000000000000') {
          history.push(`/create-exchange/${address}`)
          this.setState({ isShowingModal: false, loadingExchange: false })
          return
        }
        getT2CRtoken(address, web3,networkId).then(t2crData => {
          const { ticker, symbolMultihash, name } = t2crData
          addExchange({ label: ticker, tokenAddress: address, exchangeAddress: data, symbolMultihash, name })
          onCurrencySelected(address)
          this.setState({ isShowingModal: false, loadingExchange: false })
        })
      })
    } else {
      onCurrencySelected(address)
      this.setState({ isShowingModal: false })
    }
  }

  renderTokenList() {
    const {
      loadingExchange,
      searchQuery,
      prevQuery,
      t2crData,
      missingT2CRData
    } = this.state
    const {
      t,
      selectedTokens,
      disableTokenSelect,
      web3,
      selectors,
      account,
      factoryAddress,
      exchangeAddresses: { fromToken },
      addExchange,
      history,
      networkId
    } = this.props
    const tokens = this.createTokenList(t2crData)

    if (loadingExchange)
      return (
        <div className="token-modal__token-row token-modal__token-row--searching">
          <div className="loader" />
          <div>Searching Exchanges...</div>
        </div>
      )

    if (!loadingExchange && missingT2CRData)
      return (
        <a href="https://tokens.kleros.io/tokens" style={{textDecoration: 'none', color: 'white'}}>
          <div
            className="token-modal__token-row token-modal__token-row--searching"
            style={{
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: 'cornflowerblue'
            }}
          >
            <div>Missing Token on T2CR</div>
            <small>Click to add</small>
          </div>
        </a>
      )

    if (web3 && web3.utils && web3.utils.isAddress(searchQuery) && prevQuery !== searchQuery && !loadingExchange) {
      const tokenAddress = searchQuery
      const factory = new web3.eth.Contract(FACTORY_ABI, factoryAddress)
      const exchangeAddress = fromToken[tokenAddress]

      if (!exchangeAddress) {
        this.setState({ loadingExchange: true })
        factory.methods.getExchange(tokenAddress).call((err, data) => {
          if (err || data === '0x0000000000000000000000000000000000000000') {
            this.setState({ loadingExchange: false, prevQuery: searchQuery })
            return
          }
          getT2CRtoken(tokenAddress, web3,networkId).then(t2crData => {
            if (t2crData) {
              const { ticker, symbolMultihash, name } = t2crData
              addExchange({ label: ticker, tokenAddress, exchangeAddress: data, symbolMultihash, name })
              this.setState({ loadingExchange: false, prevQuery: searchQuery, t2crData, missingT2CRData: false })
            } else {
              this.setState({ loadingExchange: false, prevQuery: searchQuery, missingT2CRData: true })
            }
          })
        })
      }
    }

    if (disableTokenSelect) {
      return
    }

    let results

    if (!searchQuery) {
      results = tokens
    } else {
      const fuse = new Fuse(tokens, FUSE_OPTIONS)
      results = fuse.search(this.state.searchQuery)
    }

    if (
      !results.length &&
      web3 &&
      web3.utils &&
      web3.utils.isAddress(searchQuery)
    ) {
      const { label } = selectors().getBalance(account, searchQuery)
      return [
        <div
          key="token-modal-no-exchange"
          className="token-modal__token-row token-modal__token-row--no-exchange"
        >
          <div>{t('noExchange')}</div>
        </div>,
        <div
          key="token-modal-create-exchange"
          className="token-modal__token-row token-modal__token-row--create-exchange"
          onClick={() => {
            this.setState({ isShowingModal: false })
            history.push(`/create-exchange/${searchQuery}`)
          }}
        >
          <div>{`Create exchange for ${label}`}</div>
        </div>
      ]
    }

    if (!results.length) {
      return (
        <div className="token-modal__token-row token-modal__token-row--no-exchange">
          <div>{t('noExchange')}</div>
        </div>
      )
    }

    return results.map(({ label, address, name, symbolMultihash }) => {
      const isSelected = selectedTokens.indexOf(address) > -1

      return (
        <div
          key={label}
          className={classnames('token-modal__token-row', {
            'token-modal__token-row--selected': isSelected
          })}
          onClick={() => this.onTokenSelect(address)}
        >
          <TokenLogo className="token-modal__token-logo" address={address} symbolMultihash={symbolMultihash}/>
          <div className="token-modal__token-label">{name}</div>
          <div className="token-modal__token-label">{label}</div>
        </div>
      )
    })
  }

  renderModal() {
    if (!this.state.isShowingModal) {
      return null
    }

    return (
      <Modal
        onClose={() =>
          this.setState({ isShowingModal: false, searchQuery: '' })
        }
      >
        <CSSTransitionGroup
          transitionName="token-modal"
          transitionAppear={true}
          transitionLeave={true}
          transitionAppearTimeout={200}
          transitionLeaveTimeout={200}
          transitionEnterTimeout={200}
        >
          <div className="token-modal">
            <div className="token-modal__search-container">
              <input
                type="text"
                placeholder={this.props.t('searchOrPaste')}
                className="token-modal__search-input"
                onChange={e => {
                  this.setState({ searchQuery: e.target.value })
                }}
              />
              <img src={SearchIcon} className="token-modal__search-icon" />
            </div>
            <div className="token-modal__token-list">
              {this.renderTokenList()}
            </div>
          </div>
        </CSSTransitionGroup>
      </Modal>
    )
  }

  renderUnlockButton() {
    const {
      t,
      selectors,
      selectedTokenAddress,
      account,
      exchangeAddresses: { fromToken },
      web3,
      disableUnlock,
      transactions,
      pendingApprovals,
      value,
      addApprovalTx,
      addPendingTx
    } = this.props

    if (
      disableUnlock ||
      !selectedTokenAddress ||
      selectedTokenAddress === 'ETH'
    ) {
      return
    }

    const { value: allowance, decimals, label } = selectors().getApprovals(
      selectedTokenAddress,
      account,
      fromToken[selectedTokenAddress]
    )

    if (
      !label ||
      (allowance.isGreaterThanOrEqualTo(BN((value || 0) * 10 ** decimals)) &&
        !BN(allowance).isZero())
    ) {
      return
    }
    const approvalTxId = pendingApprovals[selectedTokenAddress]
    if (approvalTxId && transactions.pending.includes(approvalTxId)) {
      return (
        <button className="currency-input-panel__sub-currency-select currency-input-panel__sub-currency-select--pending">
          <div className="loader" />
          {t('pending')}
        </button>
      )
    }

    return (
      <button
        className="currency-input-panel__sub-currency-select"
        onClick={() => {
          const contract = new web3.eth.Contract(
            ERC20_ABI,
            selectedTokenAddress
          )
          const amount = BN(10 ** decimals)
            .multipliedBy(10 ** 8)
            .toFixed(0)
          contract.methods
            .approve(fromToken[selectedTokenAddress], amount)
            .send({ from: account }, (err, data) => {
              if (!err && data) {
                addPendingTx(data)
                addApprovalTx({
                  tokenAddress: selectedTokenAddress,
                  txId: data
                })
              }
            })
        }}
      >
        {t('unlock')}
      </button>
    )
  }

  renderInput() {
    const {
      t,
      errorMessage,
      value,
      onValueChange,
      selectedTokenAddress,
      disableTokenSelect,
      renderInput,
      tokenAddresses
    } = this.props

    if (typeof renderInput === 'function') {
      return renderInput()
    }

    let symbolMultihash
    const matches = tokenAddresses.addresses.filter(t => t[1] === selectedTokenAddress)
    if (matches.length >= 1) {
      symbolMultihash = matches[0][3]
    }

    return (
      <div className="currency-input-panel__input-row">
        <input
          type="number"
          min="0"
          className={classnames('currency-input-panel__input', {
            'currency-input-panel__input--error': errorMessage
          })}
          placeholder="0.0"
          onChange={e => onValueChange(e.target.value)}
          onKeyPress={e => {
            const charCode = e.which ? e.which : e.keyCode

            // Prevent 'minus' character
            if (charCode === 45) {
              e.preventDefault()
              e.stopPropagation()
            }
          }}
          value={value}
        />
        {this.renderUnlockButton()}
        <button
          className={classnames('currency-input-panel__currency-select', {
            'currency-input-panel__currency-select--selected': selectedTokenAddress,
            'currency-input-panel__currency-select--disabled': disableTokenSelect
          })}
          onClick={() => {
            if (!disableTokenSelect) {
              this.setState({ isShowingModal: true })
            }
          }}
        >
          {selectedTokenAddress ? (
            <TokenLogo
              className="currency-input-panel__selected-token-logo"
              address={selectedTokenAddress}
              symbolMultihash={symbolMultihash}
            />
          ) : null}
          {TOKEN_ADDRESS_TO_LABEL[selectedTokenAddress] || t('selectToken')}
          <span className="currency-input-panel__dropdown-icon" />
        </button>
      </div>
    )
  }

  render() {
    const { title, description, extraText, errorMessage } = this.props
    return (
      <div className="currency-input-panel">
        <div
          className={classnames('currency-input-panel__container', {
            'currency-input-panel__container--error': errorMessage
          })}
        >
          <div className="currency-input-panel__label-row">
            <div className="currency-input-panel__label-container">
              <span className="currency-input-panel__label">{title}</span>
              <span className="currency-input-panel__label-description">
                {description}
              </span>
            </div>
            <span
              className={classnames('currency-input-panel__extra-text', {
                'currency-input-panel__extra-text--error': errorMessage
              })}
            >
              {extraText}
            </span>
          </div>
          {this.renderInput()}
        </div>
        {this.renderModal()}
      </div>
    )
  }
}

export default withRouter(
  connect(
    state => ({
      factoryAddress: state.addresses.factoryAddress,
      exchangeAddresses: state.addresses.exchangeAddresses,
      tokenAddresses: state.addresses.tokenAddresses,
      contracts: state.contracts,
      account: state.web3connect.account,
      approvals: state.web3connect.approvals,
      transactions: state.web3connect.transactions,
      web3: state.web3connect.web3,
      pendingApprovals: state.pending.approvals,
      networkId: state.web3connect.networkId
    }),
    dispatch => ({
      selectors: () => dispatch(selectors()),
      addExchange: opts => dispatch(addExchange(opts)),
      addPendingTx: opts => dispatch(addPendingTx(opts)),
      addApprovalTx: opts => dispatch(addApprovalTx(opts))
    })
  )(withNamespaces()(CurrencyInputPanel))
)
