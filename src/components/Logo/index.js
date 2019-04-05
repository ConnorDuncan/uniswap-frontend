import './logo.scss'
import React from 'react'
import logo from '../../assets/images/logo.png'

export default () => (
  <div className="logo">
    <span aria-label="logo" role="img">
      <img alt="Uniswap Ninja Logo" src={logo} />
    </span>
  </div>
)
