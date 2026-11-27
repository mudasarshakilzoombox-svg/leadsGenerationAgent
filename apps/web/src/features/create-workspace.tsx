'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CreateWorkspaceRequestSchema, WorkspaceSummarySchema } from '@lga/contracts';
import { Input } from '@lga/ui/components/input';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { applyApiError, Field, SubmitButton } from '@/components/forms';
import { api } from '@/lib/api/client';
import { hardNavigate } from '@/lib/navigate';

const FormSchema = z.object({
  name: CreateWorkspaceRequestSchema.shape.name,
  websiteUrl: z.union([
    z.literal(''),
    z.url({ protocol: /^https?$/, message: 'Enter a full URL, e.g. https://example.com' }),
  ]),
});

/** PRD WS-01: name, optional website, time zone pre-filled from the browser. */
export function CreateWorkspaceForm({ autoFocus }: { autoFocus?: boolean }) {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    mode: 'onBlur',
    defaultValues: { name: '', websiteUrl: '' },
  });
  const submit = form.handleSubmit(async ({ name, websiteUrl }) => {
    try {
      const workspace = await api('/workspaces', WorkspaceSummarySchema, {
        method: 'POST',
        body: {
          name,
          ...(websiteUrl ? { websiteUrl } : {}),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      toast.success(`${workspace.name} is ready. Your 14-day trial has started.`);
      hardNavigate(`/${workspace.slug}`);
    } catch (error) {
      applyApiError(error, form.setError, ['name', 'websiteUrl']);
    }
  });
  return (
    <form method="post" onSubmit={submit} noValidate className="space-y-4">
      <Field
        label="Workspace name"
        error={form.formState.errors.name?.message}
        hint="Usually your company or agency name."
      >
        {(p) => (
          <Input
            {...p}
            autoFocus={autoFocus}
            autoComplete="organization"
            {...form.register('name')}
          />
        )}
      </Field>
      <Field label="Company website (optional)" error={form.formState.errors.websiteUrl?.message}>
        {(p) => (
          <Input
            {...p}
            type="url"
            inputMode="url"
            placeholder="https://"
            {...form.register('websiteUrl')}
          />
        )}
      </Field>
      <SubmitButton
        pending={form.formState.isSubmitting}
        pendingLabel="Creating…"
        className="w-full sm:w-auto"
      >
        Create workspace
      </SubmitButton>
    </form>
  );
}
