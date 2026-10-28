import type { Expense, ExpenseData } from '../types';

// Re-export ExpenseData for components
export type { ExpenseData } from '../types';

const API_BASE_URL = '/api';

export interface LineItem {
  description: string;
  quantity: number;
  price: number;
}

// ============ ADMIN TYPES ============
export interface AdminStats {
  totalUsers: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
  activeUsers7Days: number;
  totalExpenses: number;
  expensesToday: number;
  expensesThisWeek: number;
  expensesThisMonth: number;
  categoryBreakdown: { category: string; count: number }[];
  aiProviderBreakdown: { provider: string; count: number }[];
  currencyBreakdown: { currency: string; count: number }[];
}

export interface UserWithStats {
  id: string;
  email: string;
  created_at: number;
  email_verified: number;
  expenseCount: number;
  lastExpenseAt: number | null;
  settings: {
    currency: string;
    aiProvider: string;
  } | null;
}

export interface UserExpense extends Expense {
  lineItems: LineItem[];
}

// Helper to get auth headers
const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem('auth_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

class ExpenseService {
  /**
   * Process a receipt image using the backend API
   */
  async processReceipt(base64Image: string): Promise<{ success: boolean; data?: ExpenseData; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/receipts/process`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ image: base64Image }),
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.error || 'Failed to process receipt',
        };
      }

      return { success: true, data: result.data };
    } catch (error: any) {
      console.error('Error processing receipt:', error);
      return {
        success: false,
        error: error.message || 'An unexpected error occurred while processing the receipt.',
      };
    }
  }

  /**
   * Process an audio file using the backend API
   */
  async processAudioReceipt(audioBlob: Blob): Promise<{ success: boolean; data?: ExpenseData[]; error?: string }> {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob);
      
      // Add user's local date in YYYY-MM-DD format
      const userLocalDate = new Date().toISOString().split('T')[0];
      formData.append('userLocalDate', userLocalDate);

      const response = await fetch(`${API_BASE_URL}/receipts/process-audio`, {
        method: 'POST',
        headers: {
          'Authorization': getAuthHeaders()['Authorization'] as string,
        },
        credentials: 'include',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.error || 'Failed to process audio',
        };
      }

      return { success: true, data: result.data.receipts };
    } catch (error: any) {
      console.error('Error processing audio:', error);
      return {
        success: false,
        error: error.message || 'An unexpected error occurred while processing the audio.',
      };
    }
  }

  /**
   * Save a new expense
   */
  async saveExpense(expenseData: ExpenseData): Promise<{ success: boolean; data?: Expense; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/expenses`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(expenseData),
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.error || 'Failed to save expense',
        };
      }

      return { success: true, data: result.data };
    } catch (error: any) {
      console.error('Failed to save expense:', error);
      return { success: false, error: error.message || 'Failed to save expense.' };
    }
  }

  /**
   * Get all expenses for the current user
   */
  async getExpenses(): Promise<{ success: boolean; data?: Expense[]; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/expenses`, {
        headers: getAuthHeaders(),
        credentials: 'include',
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.error || 'Failed to retrieve expenses',
        };
      }

      return { success: true, data: result.data };
    } catch (error: any) {
      console.error('Failed to get expenses:', error);
      return { success: false, error: error.message || 'Failed to retrieve expenses.' };
    }
  }

  /**
   * Delete an expense
   */
  async deleteExpense(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/expenses/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.error || 'Failed to delete expense',
        };
      }

      return { success: true };
    } catch (error: any) {
      console.error('Failed to delete expense:', error);
      return { success: false, error: error.message || 'Failed to delete expense.' };
    }
  }

  /**
   * Update an existing expense
   */
  async updateExpense(id: string, updatedData: ExpenseData): Promise<{ success: boolean; data?: Expense; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/expenses/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(updatedData),
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.error || 'Failed to update expense',
        };
      }

      return { success: true, data: result.data };
    } catch (error: any) {
      console.error('Failed to update expense:', error);
      return { success: false, error: error.message || 'Failed to update expense.' };
    }
  }

  // ============ ADMIN METHODS ============

  /**
   * Check if current user is an admin
   */
  async checkAdmin(): Promise<{ success: boolean; isAdmin: boolean }> {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/check`, {
        headers: getAuthHeaders(),
        credentials: 'include',
      });

      if (!response.ok) {
        return { success: true, isAdmin: false };
      }

      const result = await response.json();
      return { success: true, isAdmin: result.data?.isAdmin === true };
    } catch (error: any) {
      console.error('Admin check error:', error);
      return { success: false, isAdmin: false };
    }
  }

  /**
   * Get admin dashboard statistics
   */
  async getAdminStats(): Promise<{ success: boolean; data?: AdminStats; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/stats`, {
        headers: getAuthHeaders(),
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 404) {
          return { success: false, error: 'Not authorized' };
        }
        const result = await response.json();
        return { success: false, error: result.error || 'Failed to fetch stats' };
      }

      const result = await response.json();
      return { success: true, data: result.data };
    } catch (error: any) {
      console.error('Failed to get admin stats:', error);
      return { success: false, error: error.message || 'Failed to fetch stats.' };
    }
  }

  /**
   * Get all users with their stats (admin only)
   */
  async getAdminUsers(): Promise<{ success: boolean; data?: UserWithStats[]; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/users`, {
        headers: getAuthHeaders(),
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 404) {
          return { success: false, error: 'Not authorized' };
        }
        const result = await response.json();
        return { success: false, error: result.error || 'Failed to fetch users' };
      }

      const result = await response.json();
      return { success: true, data: result.data };
    } catch (error: any) {
      console.error('Failed to get admin users:', error);
      return { success: false, error: error.message || 'Failed to fetch users.' };
    }
  }

  /**
   * Get expenses for a specific user by email (admin only)
   */
  async getAdminUserExpenses(email: string): Promise<{ success: boolean; data?: UserExpense[]; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/user/${encodeURIComponent(email)}/expenses`, {
        headers: getAuthHeaders(),
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 404) {
          return { success: false, error: 'Not authorized or user not found' };
        }
        const result = await response.json();
        return { success: false, error: result.error || 'Failed to fetch user expenses' };
      }

      const result = await response.json();
      return { success: true, data: result.data };
    } catch (error: any) {
      console.error('Failed to get admin user expenses:', error);
      return { success: false, error: error.message || 'Failed to fetch user expenses.' };
    }
  }

}

export const expenseService = new ExpenseService();