import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { toast } from "sonner";
import { Save, Loader } from "lucide-react";
import { expenseService, ExpenseData } from "@/lib/expense-service";
import type { Expense } from "@/types";
import { useIsMobile } from "@/hooks/use-mobile";
import { ExpenseForm } from "./ExpenseForm";

interface EditExpenseDialogProps {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updatedExpense: Expense) => void;
}

export const EditExpenseDialog: React.FC<EditExpenseDialogProps> = ({
  expense,
  open,
  onOpenChange,
  onSave,
}) => {
  const [editedData, setEditedData] = useState<ExpenseData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (expense) {
      setEditedData(JSON.parse(JSON.stringify(expense)));
      setIsDirty(false); // Reset dirty state on new expense
    }
  }, [expense]);

  useEffect(() => {
    if (expense && editedData) {
      setIsDirty(JSON.stringify(expense) !== JSON.stringify(editedData));
    }
  }, [editedData, expense]);

  const handleCloseAttempt = () => {
    if (isDirty && !isSaving) {
      setIsConfirmationOpen(true);
    } else {
      onOpenChange(false);
    }
  };

  const handleConfirmClose = () => {
    onOpenChange(false);
    setIsConfirmationOpen(false);
  };

  const handleSave = async () => {
    if (editedData && expense) {
      setIsSaving(true);
      try {
        const response = await expenseService.updateExpense(
          expense.id,
          editedData
        );
        if (response.success && response.data) {
          toast.success("Expense Updated!", {
            description: `Changes to ${response.data.merchant} have been saved.`,
          });
          onSave(response.data);
          onOpenChange(false);
        } else {
          toast.error("Update Failed", { description: response.error });
        }
      } catch (e) {
        toast.error("Update Error", {
          description: "Could not connect to the server.",
        });
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      handleCloseAttempt();
    } else {
      onOpenChange(true);
    }
  };

  const dialogContent = (
    <>
      {editedData && (
        <div className="px-4 overflow-y-auto">
          <ExpenseForm value={editedData} onChange={setEditedData} />
        </div>
      )}
    </>
  );

  return (
    <>
      {isMobile ? (
        <Drawer open={open} onOpenChange={handleOpenChange}>
          <DrawerContent className="max-h-[85vh]">
            <DrawerHeader>
              <DrawerTitle>Edit Expense</DrawerTitle>
              <DrawerDescription>
                Make changes to your expense record below. Click save when you're
                done.
              </DrawerDescription>
            </DrawerHeader>
            {dialogContent}
            <DrawerFooter className="pt-2 gap-2">
              <Button
                variant="outline"
                disabled={isSaving}
                onClick={handleCloseAttempt}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving || !isDirty}>
                {isSaving ? (
                  <Loader className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Expense</DialogTitle>
              <DialogDescription>
                Make changes to your expense record below. Click save when you're
                done.
              </DialogDescription>
            </DialogHeader>
            {dialogContent}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleCloseAttempt}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving || !isDirty}>
                {isSaving ? (
                  <Loader className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      <AlertDialog
        open={isConfirmationOpen}
        onOpenChange={setIsConfirmationOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You have unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to discard your changes? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue Editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmClose}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
