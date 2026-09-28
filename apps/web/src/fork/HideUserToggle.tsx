/** Fork patch: owner toggle to hide a person from active streams and history. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { API_BASE_URL } from '@/lib/api';

const HIDDEN_USERS_URL = `${API_BASE_URL}/fork/hidden-users`;
const HIDDEN_USERS_KEY = ['fork', 'hiddenUsers'] as const;

async function hiddenUsersRequest(path: string, method = 'GET'): Promise<string[]> {
  const response = await fetch(`${HIDDEN_USERS_URL}${path}`, { method, credentials: 'include' });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  const body = (await response.json()) as { data: string[] };
  return body.data;
}

export function HideUserToggle({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { data: hiddenIds, error } = useQuery({
    queryKey: HIDDEN_USERS_KEY,
    queryFn: () => hiddenUsersRequest(''),
  });
  const hidden = hiddenIds?.includes(userId) ?? false;

  const mutation = useMutation({
    mutationFn: (hide: boolean) => hiddenUsersRequest(`/${userId}`, hide ? 'PUT' : 'DELETE'),
    onSuccess: (data, hide) => {
      queryClient.setQueryData(HIDDEN_USERS_KEY, data);
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['stats', 'dashboard'] });
      toast.success(hide ? 'Hidden from activity and history' : 'Shown in activity and history');
    },
    onError: (error: Error) => {
      toast.error('Could not change visibility', { description: error.message });
    },
  });

  if (hiddenIds === undefined && !error) return null;

  const label = error
    ? `Hidden users unavailable: ${error.message}`
    : hidden
      ? 'Show in activity and history'
      : 'Hide from activity and history';
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        aria-label={label}
        title={label}
        disabled={!!error || mutation.isPending}
        onClick={() => mutation.mutate(!hidden)}
      >
        {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </Button>
      {hidden && (
        <Badge variant="secondary" className="gap-1 font-normal">
          <EyeOff className="h-3 w-3" />
          Hidden
        </Badge>
      )}
    </>
  );
}
