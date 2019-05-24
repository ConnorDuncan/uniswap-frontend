import _arbitrableAddressList from '../abi/arbitrable-address-list.json'
import _arbitrableTokenList from '../abi/arbitrable-token-list.json'

const zeroAddress = '0x0000000000000000000000000000000000000000'
const zeroSubmissionID =
  '0x0000000000000000000000000000000000000000000000000000000000000000'
const filter = [false, true, false, true, false, true, false, false]

export default async (web3, networkID) => {
  const arbitrableTokenList = new web3.eth.Contract(
    _arbitrableTokenList,
    networkID === 42 || networkID === '42'
      ? '0x25dd2659a1430cdbd678615c7409164ae486c146'
      : '0xebcf3bca271b26ae4b162ba560e243055af0e679'
  )
  const arbitrableAddressList = new web3.eth.Contract(
    _arbitrableAddressList,
    networkID === 42 || networkID === '42'
      ? '0x78895ec026aeff2db73bc30e623c39e1c69b1386'
      : '0xcb4aae35333193232421e86cd2e9b6c91f3b125f'
  )

  const addressesWithBadge = (await arbitrableAddressList.methods
    .queryAddresses(zeroAddress, 100, filter, true)
    .call()).values.filter(address => address !== zeroAddress)

  const submissionIDs = [].concat(
    ...(await Promise.all(
      addressesWithBadge.map(address =>
        arbitrableTokenList.methods
          .queryTokens(zeroSubmissionID, 100, filter, true, address)
          .call()
          .then(res => res.values.filter(ID => ID !== zeroSubmissionID))
      )
    ))
  )

  const tokenData = (await Promise.all(
    submissionIDs.map(ID => arbitrableTokenList.methods.getTokenInfo(ID).call())
  )).reduce((acc, submission) => {
    if (acc[submission.addr]) acc[submission.addr].push(submission)
    else acc[submission.addr] = [submission]
    return acc
  }, {})

  return Object.keys(tokenData).map(address => [
    tokenData[address][0].ticker,
    address,
    tokenData[address][0].name,
    tokenData[address][0].symbolMultihash,
  ])
}
