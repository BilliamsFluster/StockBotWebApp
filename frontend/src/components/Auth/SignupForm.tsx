"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, ChangeEvent, FormEvent } from "react";
import { signup } from "@/api/client";
import { toast } from "react-hot-toast";

interface SignupFormProps {
  switchToLogin: () => void;
}

export function SignupForm({ switchToLogin }: SignupFormProps) {
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
  });

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await signup(form);
      toast.success("Signup successful! Please log in.");
      switchToLogin();
    } catch (error: any) {
      const msg = error?.response?.data?.message || "Signup failed";
      toast.error(msg);
    }
  };

  return (
    // Removed "gradient-ring". The "ink-card" class now provides the glass effect.
    <Card className="w-full max-w-md ink-card">
      <CardHeader>
        <CardTitle>Create an Account</CardTitle>
        <CardDescription>
          Enter your details below to get started.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              placeholder="yourusername"
              required
              name="username"
              value={form.username}
              onChange={handleChange}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="m@example.com"
              required
              name="email"
              value={form.email}
              onChange={handleChange}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              name="password"
              value={form.password}
              onChange={handleChange}
            />
          </div>
          <Button type="submit" className="w-full btn-gradient">
            Create Account
          </Button>
        </form>
        <div className="mt-4 text-center text-sm">
          Already have an account?{" "}
          <button
            type="button"
            onClick={switchToLogin}
            className="underline text-primary hover:text-primary/80"
          >
            Login
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
