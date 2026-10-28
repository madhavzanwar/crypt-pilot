import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ExpenseForm } from '@/components/ExpenseForm';
import { Loader2, Save, X } from 'lucide-react';
import type { ExpenseData } from '@/lib/expense-service';
import { expenseService } from '@/lib/expense-service';
import { toast } from 'sonner';

interface ReceiptReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipts: ExpenseData[];
  onSaveComplete: () => void;
}

export const ReceiptReviewDialog: React.FC<ReceiptReviewDialogProps> = ({
  open,
  onOpenChange,
  receipts,
  onSaveComplete,
}) => {
  const [editedReceipts, setEditedReceipts] = useState<ExpenseData[]>(receipts);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('0');

  // Update edited receipts when receipts prop changes
  React.useEffect(() => {
    setEditedReceipts(receipts);
    setActiveTab('0');
  }, [receipts]);

  const handleReceiptChange = (index: number, data: ExpenseData) => {
    const newReceipts = [...editedReceipts];
    newReceipts[index] = data;
    setEditedReceipts(newReceipts);
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      const results = await Promise.allSettled(
        editedReceipts.map((receipt) => expenseService.saveExpense(receipt))
      );

      const successful = results.filter((r) => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.length - successful;

      if (successful > 0) {
        toast.success(`Successfully saved ${successful} receipt${successful > 1 ? 's' : ''}`);
        onSaveComplete();
        onOpenChange(false);
      }

      if (failed > 0) {
        toast.error(`Failed to save ${failed} receipt${failed > 1 ? 's' : ''}`);
      }
    } catch (error) {
      console.error('Error saving receipts:', error);
      toast.error('An error occurred while saving receipts');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Review Receipts
            <Badge variant="secondary">{editedReceipts.length} found</Badge>
          </DialogTitle>
          <DialogDescription>
            Review and edit the receipts extracted from your audio. Click through each tab to verify the details.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full grid" style={{ gridTemplateColumns: `repeat(${editedReceipts.length}, 1fr)` }}>
              {editedReceipts.map((receipt, index) => (
                <TabsTrigger key={index} value={index.toString()} className="text-xs sm:text-sm">
                  {receipt.merchant || `Receipt ${index + 1}`}
                </TabsTrigger>
              ))}
            </TabsList>

            {editedReceipts.map((receipt, index) => (
              <TabsContent key={index} value={index.toString()} className="mt-4">
                <ExpenseForm
                  value={receipt}
                  onChange={(data) => handleReceiptChange(index, data)}
                />
              </TabsContent>
            ))}
          </Tabs>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button onClick={handleSaveAll} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save All ({editedReceipts.length})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
