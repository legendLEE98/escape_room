import { useState } from 'react';
import { login, signup } from '../data/auth.js';
import { useBackdropDismiss } from './useBackdropDismiss.js';

// `reason` explains why the modal opened (e.g. "맵 제작은 로그인이 필요합니다.").
export default function AuthModal({ reason, onClose, onSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const backdropProps = useBackdropDismiss(onClose);

  const isSignup = mode === 'signup';

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const user = isSignup
        ? await signup({ email, password, nickname })
        : await login({ email, password });
      onSuccess(user);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError('');
  };

  return (
    <div className="modal-backdrop" {...backdropProps}>
      <form className="modal auth-modal" onSubmit={handleSubmit}>
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${!isSignup ? 'is-active' : ''}`}
            onClick={() => switchMode('login')}
          >
            로그인
          </button>
          <button
            type="button"
            className={`auth-tab ${isSignup ? 'is-active' : ''}`}
            onClick={() => switchMode('signup')}
          >
            회원가입
          </button>
        </div>

        {reason && <p className="auth-reason">{reason}</p>}

        <label htmlFor="auth-email">이메일</label>
        <input
          id="auth-email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <label htmlFor="auth-password">비밀번호{isSignup ? ' (8자 이상)' : ''}</label>
        <input
          id="auth-password"
          type="password"
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          required
          minLength={isSignup ? 8 : undefined}
          maxLength={128}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        {isSignup && (
          <>
            <label htmlFor="auth-nickname">닉네임</label>
            <input
              id="auth-nickname"
              type="text"
              required
              maxLength={24}
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
            />
            <p className="auth-hint">가입하면 닉네임 뒤에 #랜덤4글자가 붙습니다. (예: 홍길동#k3x9)</p>
          </>
        )}

        {error && <p className="auth-error">{error}</p>}

        <div className="action-grid">
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? '처리 중...' : isSignup ? '가입하기' : '로그인'}
          </button>
        </div>
      </form>
    </div>
  );
}
