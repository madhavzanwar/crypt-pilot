import { useAuth } from '@/contexts/AuthContext';

export function useAuthHook() {
    return useAuth();
}
