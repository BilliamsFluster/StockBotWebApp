'use client';

import { useState, ChangeEvent, FormEvent } from 'react';
import { login } from '../../api/client'; // make sure this sends { withCredentials: true }
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

interface LoginFormFields {
  email: string;
  password: string;
}

const LoginForm = () => {
  const [form, setForm] = useState<LoginFormFields>({ email: '', password: '' });
  const { setUser } = useAuth();
  const router = useRouter();

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Basic client-side validation
    if (!form.email || !form.password) {
      return toast.error('Please fill in all fields.');
    }

    if (form.password.length < 6) {
      return toast.error('Password must be at least 6 characters.');
    }

    try {
      // This request will set an HTTP-only cookie in the browser
      const { data } = await login(form);

      // We don't store tokens in localStorage anymore — backend cookie handles auth
      setUser(data.user || true);

      toast.success('Logged in!');
      router.push('/chatbot');
    } catch (err: any) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || 'Login failed';

      console.error('❌ Login error:', err);
      toast.error(`Status: ${status || 'N/A'} | ${msg}`);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-sm mx-auto card p-6 bg-base-200 shadow-md space-y-4"
    >
      <h2 className="text-lg font-bold">Login</h2>

      <input
        type="email"
        name="email"
        placeholder="Email"
        className="input input-bordered w-full"
        value={form.email}
        onChange={handleChange}
        required
      />

      <input
        type="password"
        name="password"
        placeholder="Password"
        className="input input-bordered w-full"
        value={form.password}
        onChange={handleChange}
        required
      />

      <button type="submit" className="btn btn-primary w-full">
        Login
      </button>
    </form>
  );
};

export default LoginForm;
