import logo from '../assets/utilint-logo.svg';

export function Brand() {
  return (
    <span className="brand">
      <img className="brand-mark" src={logo} width="32" height="32" alt="" />
      <span className="wordmark">utilint</span>
    </span>
  );
}
