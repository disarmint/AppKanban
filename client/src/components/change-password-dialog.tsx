import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getErrorMessage } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

/** Blocking dialog shown when the logged-in user has mustChangePassword=true.
 * It cannot be dismissed until a new password is set. */
export function ChangePasswordDialog() {
  const { changePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 4) {
      setError("Пароль минимум 4 символа");
      return;
    }
    if (password !== confirm) {
      setError("Пароли не совпадают");
      return;
    }
    setIsSubmitting(true);
    try {
      await changePassword(password);
    } catch (err) {
      setError(getErrorMessage(err) || "Не удалось сменить пароль");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open>
      <DialogContent
        className="sm:max-w-sm"
        data-testid="dialog-change-password"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Смените пароль</DialogTitle>
          <DialogDescription>
            Ваш пароль был сброшен администратором. Задайте новый пароль, чтобы продолжить.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">Новый пароль</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="input-new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Повторите пароль</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              data-testid="input-confirm-password"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" data-testid="text-change-password-error">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" className="w-full" disabled={isSubmitting} data-testid="button-submit-change-password">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Сохранить пароль
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
