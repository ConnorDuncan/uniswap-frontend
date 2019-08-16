import React from 'react'
import styled from 'styled-components'
import { Check } from 'react-feather'

import { Spinner } from '../../theme'
import Circle from '../../assets/images/circle.svg'
import { theme } from '../../theme'
import { useDarkModeManager } from '../../contexts/LocalStorage';

const TitleText = styled.h4`
  margin: 0;
  color: #474747;
`

const DescriptionText = styled.h5`
  margin: 0;
  font-weight: 400;
`

const ColumnDiv = styled.div`
  display: flex;
  flex-direction: row;
`

const SpinnerWrapper = styled(Spinner)`
  margin: 0 0.25rem 0 0.25rem;
`

const StyledCheck = styled(Check)`
  margin-right: 10px;
`

export const TYPE = {
  SUCCESS: 0,
  PENDING: 1
}

export default ({ title, msg, type = TYPE.PENDING }) => {
  const [darkMode] = useDarkModeManager()

  return (
    <ColumnDiv>
      {type === TYPE.SUCCESS ? (
        <StyledCheck size="16" color={theme(darkMode).royalBlue} />
      ) : (
        <SpinnerWrapper src={Circle} alt="loader" />
      )}
      <div>
        <TitleText>{title}</TitleText>
        <DescriptionText style={{}}>{msg}</DescriptionText>
      </div>
    </ColumnDiv>
  )
}
