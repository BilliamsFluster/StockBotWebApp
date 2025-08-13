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
import { login } from "../../api/client";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";

interface LoginFormProps {
  switchToSignup: () => void;
}

export function LoginForm({ switchToSignup }: LoginFormProps) {
  const [form, setForm] = useState({ email: "", password: "" });
  const { setUser } = useAuth();
  const router = useRouter();

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const { data } = await login(form);
      setUser(data.user || true);
      toast.success("Logged in!");
      router.push("/overview");
    } catch (err: any) {
      const msg = err.response?.data?.message || "Login failed";
      toast.error(msg);
    }
  };

  return (
    // Removed "gradient-ring". The "ink-card" class now provides the glass effect.
    <Card className="w-full max-w-md ink-card">
      <CardHeader>
        <CardTitle>Welcome Back</CardTitle>
        <CardDescription>
          Enter your credentials to access your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
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
          {/* Apply your custom "btn-gradient" class here */}
          <Button type="submit" className="w-full btn-gradient">
            Login
          </Button>
        </form>
        <div className="mt-4 text-center text-sm">
          Don't have an account?{" "}
          <button
            type="button"
            onClick={switchToSignup}
            className="underline text-primary hover:text-primary/80"
          >
            Sign up
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
