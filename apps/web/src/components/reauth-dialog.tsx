'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@lga/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@lga/ui/components/dialog';
import { Input } from '@lga/ui/components/input';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { applyApiError, Field, SubmitButton } from '@/components/forms';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';

/** Step-up (08-authentication §7): asks for the password, then retries the action. */
export function ReauthDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const form = useForm<{ password: string }>({
    resolver: zodResolver(z.object({ password: z.string().min(1, 'Enter your password.') })),
    defaultValues: { password: '' },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm your password</DialogTitle>
          <DialogDescription>
            For your security, confirm your password to continue.
          </DialogDescription>
        </DialogHeader>
        <form
          method="post"
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit(async ({ password }) => {
            try {
              await api('/auth/reauthenticate', null, { method: 'POST', body: { password } });
              form.reset();
              onOpenChange(false);
              onDone();
            } catch (error) {
              if (error instanceof ApiError && error.status === 401)
                form.setError('password', { message: error.message });
              else applyApiError(error);
            }
          })}
        >
          <Field label="Password" error={form.formState.errors.password?.message}>
            {(p) => (
              <Input
                {...p}
                type="password"
                autoComplete="current-password"
                autoFocus
                {...form.register('password')}
              />
            )}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton pending={form.formState.isSubmitting} pendingLabel="Checking…">
              Confirm
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
