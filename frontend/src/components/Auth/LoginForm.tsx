'use client';

import { useState, ChangeEvent, FormEvent } from 'react';
import { login } from '../../api/client'; // adjust path if needed
import { useRouter } from 'next/navigation'; // Next.js App Router
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext'; // make sure context is typed

interface LoginFormFields {
  email: string;
  password: string;
}

const LoginForm = () => {
  const [form, setForm] = useState<LoginFormFields>({ email: '', password: '' });
  const { setUser } = useAuth(); // update type in your AuthContext for best results
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
    const { data } = await login(form);

    if (data.token) {
      localStorage.setItem('token', data.token); // ✅ Save token
    }

    setUser(data.user || true);
    toast.success('Logged in!');
    router.push('/home');
  } catch (err: any) {
    const status = err.response?.status;
    const msg = err.response?.data?.message || 'Login failed';

    if (status === 401) {
      toast.error('Incorrect email or password');
    } else {
      toast.error(msg);
    }
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
