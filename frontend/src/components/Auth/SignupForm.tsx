'use client';

import { useState, ChangeEvent, FormEvent } from 'react';
import { signup } from '@/api/client';
import { toast } from 'react-hot-toast';

interface SignupFormFields {
  username: string;
  email: string;
  password: string;
}

interface SignupFormProps {
  switchToLogin: () => void;
}

const SignupForm = ({ switchToLogin }: SignupFormProps) => {
  const [form, setForm] = useState<SignupFormFields>({
    username: '',
    email: '',
    password: '',
  });

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await signup(form);
      toast.success('Signup successful! Please log in.');
      switchToLogin();
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Signup failed';
      toast.error(msg);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <input
        type="text"
        name="username"
        placeholder="Username"
        className="input input-bordered"
        value={form.username}
        onChange={handleChange}
        required
      />
      <input
        type="email"
        name="email"
        placeholder="Email"
        className="input input-bordered"
        value={form.email}
        onChange={handleChange}
        required
      />
      <input
        type="password"
        name="password"
        placeholder="Password"
        className="input input-bordered"
        value={form.password}
        onChange={handleChange}
        required
      />
      <button type="submit" className="btn btn-primary">
        Sign Up
      </button>
    </form>
  );
};

export default SignupForm;
