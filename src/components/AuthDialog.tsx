import { useState } from 'react';
import { Lock, User, Mail } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AuthDialog = ({ open, onOpenChange }: AuthDialogProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = () => {
    // Mock authentication
    console.log('Login attempt:', { email, password });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Lock className="h-5 w-5 text-primary" />
            <DialogTitle>CHAOX HQ Authentication</DialogTitle>
          </div>
          <DialogDescription>
            Secure access to the Command & Control interface
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm">
              Email Address
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="operator@chaox.mil"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm">
              Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs">
            <Badge className="bg-secondary text-foreground">
              DEMO MODE ACTIVE
            </Badge>
            <button className="text-primary hover:underline">
              Forgot password?
            </button>
          </div>

          <Button 
            onClick={handleLogin} 
            className="w-full"
            size="lg"
          >
            <User className="h-4 w-4 mr-2" />
            Sign In
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Authorized personnel only. All access is monitored and logged.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
