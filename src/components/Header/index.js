import React from 'react'
import styled from 'styled-components'

import { Link } from '../../theme'
import logo from '../../assets/images/logo.png'
import Web3Status from '../Web3Status'
import { darken } from 'polished'

const HeaderFrame = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
`

const HeaderElement = styled.div`
  margin: 1.25rem;
  display: flex;
  min-width: 0;
  @media only screen and (max-width: 450px) {
    margin-right: 0;
  }
`

const Nod = styled.span`
  transform: rotate(0deg);
  transition: transform 150ms ease-out;

  :hover {
    transform: rotate(10deg);
  }
`

const Title = styled.div`
  display: flex;
  align-items: center;

  :hover {
    cursor: pointer;
  }

  #link {
    text-decoration-color: ${({ theme }) => theme.UniswapPink};
  }

  #title {
    display: inline;
    font-size: 1rem;
    font-weight: 500;
    color: ${({ theme }) => theme.wisteriaPurple};
    margin: 0 10px;
    @media only screen and (max-width: 450px) {
      font-size: 0.8rem;
    }
    :hover {
      color: ${({ theme }) => darken(0.1, theme.wisteriaPurple)};
    }
  }
`

const Logo = styled.img`
  width: 30px;
  height: 30px;
`

const ExtraLink = styled.h1`
  display: inline;
  font-size: 1rem;
  font-weight: 500;
  color: ${({ theme }) => theme.UniswapPink};
  margin: 0 10px;
  @media only screen and (max-width: 450px) {
    font-size: 0.8rem;
  }
  :hover {
    color: ${({ theme }) => darken(0.2, theme.wisteriaPurple)};
  }
`

export default function Header() {
  return (
    <HeaderFrame>
      <HeaderElement>
        <Title>
          <Nod>
            <Logo alt="Uniswap Ninja Logo" src={logo} />
          </Nod>
          <Link id="link" href="https://uniswap.io">
            <h1 id="title">Uniswap.Ninja</h1>
          </Link>
          <Link href="https://blog.kleros.io/erc20-becomes-part-of-the-token/">
            <ExtraLink>Add a Token</ExtraLink>
          </Link>
        </Title>
      </HeaderElement>
      <HeaderElement>
        <Web3Status />
      </HeaderElement>
    </HeaderFrame>
  )
}
