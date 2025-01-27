

import { Input } from './ui/input';
import { Label } from './ui/label';

interface AuthFormProps {
    action: (formData: FormData) => void;
    defaultEmail?: string;
    showOTP?: boolean;
    children: React.ReactNode;
}

export function AuthForm({
    action,
    defaultEmail,
    showOTP,
    children,
}: AuthFormProps) {
    return (
        <form action={action} className="flex flex-col space-y-4 px-4 sm:px-16">
            <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@princeton.com"
                    defaultValue={defaultEmail}
                    required
                    disabled={showOTP}
                />
            </div>
            {!showOTP && (
                <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                        id="password"
                        name="password"
                        type="password"
                        placeholder="••••••••"
                        required
                    />
                </div>
            )}
            {showOTP && (
                <div className="space-y-2">
                    <Label htmlFor="otp">Verification Code</Label>
                    <Input
                        id="otp"
                        name="otp"
                        type="text"
                        placeholder="123456"
                        required
                        maxLength={6}
                        pattern="\d{6}"
                    />
                </div>
            )}
            {children}
        </form>
    );
}
