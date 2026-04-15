import { useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, setToken } from "@/lib/api";

const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export default function SignupPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ fullName?: string; email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError("");
    const result = signupSchema.safeParse({ fullName, email, password });
    if (!result.success) {
      const issueMap = result.error.issues.reduce<{ fullName?: string; email?: string; password?: string }>((acc, issue) => {
        const key = issue.path[0] as "fullName" | "email" | "password";
        acc[key] = issue.message;
        return acc;
      }, {});
      setErrors(issueMap);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const data = await api.signup(fullName, email, password);
      setToken(data.access_token);
      navigate("/");
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <Card className="w-full max-w-md bg-panel">
        <CardHeader>
          <CardTitle className="text-3xl font-semibold text-card-foreground">Create account</CardTitle>
          <p className="text-sm text-muted-foreground">Start analyzing card transactions instantly</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSignup}>
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              {errors.fullName ? <p className="text-xs text-danger">{errors.fullName}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              {errors.email ? <p className="text-xs text-danger">{errors.email}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              {errors.password ? <p className="text-xs text-danger">{errors.password}</p> : null}
            </div>
            {serverError ? <p className="text-xs text-danger">{serverError}</p> : null}
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? "Creating account..." : "Sign up"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already registered?{" "}
            <Link to="/login" className="font-medium text-primary hover:text-primary/90">
              Login
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
