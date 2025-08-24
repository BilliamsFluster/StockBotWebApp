import { LoginForm } from '@/components/Auth/LoginForm';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="blob blob-blue"></div>
      <div className="blob blob-purple"></div>
      <LoginForm switchToSignup={() => { /* TODO: implement signup switch logic */ }} />
    </div>
  );
}
