import _arbitrableAddressList from '../abi/arbitrable-address-list.json'
import _arbitrableTokenList from '../abi/arbitrable-token-list.json'

const zeroAddress = '0x0000000000000000000000000000000000000000'
const zeroSubmissionID =
  '0x0000000000000000000000000000000000000000000000000000000000000000'
const filter = [false, true, false, true, false, true, false, false]

export default async (address, web3, networkID) => {
  const arbitrableTokenList = new web3.eth.Contract(
    _arbitrableTokenList,
    networkID === 42 || networkID === '42'
      ? '0x25dd2659a1430cdbd678615c7409164ae486c146'
      : '0xebcf3bca271b26ae4b162ba560e243055af0e679'
  )

  const submissionIDs = (await arbitrableTokenList.methods
      .queryTokens(zeroSubmissionID, 100, filter, true, address)
      .call()
    ).values
    .filter(ID => ID !== zeroSubmissionID)

  if (submissionIDs.length === 0) return null

  return await arbitrableTokenList.methods.getTokenInfo(submissionIDs[0]).call()
}
