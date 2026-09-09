import logo from '../assets/utilint-logo.webp';

export function Brand() {
  return (
    <span className="brand">
      <svg
        className="brand-mark"
        width="32"
        height="32"
        viewBox="240 263 780 780"
        aria-hidden="true"
        focusable="false"
      >
        {/* Frame the approved artwork without its presentation margins. */}
        <image href={logo} width="1254" height="1254" />
      </svg>
      <span className="wordmark">utilint</span>
    </span>
  );
}
