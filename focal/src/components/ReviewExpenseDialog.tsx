import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Loader, Save } from 'lucide-react';
import { ExpenseForm } from '@/components/ExpenseForm';
import type { ExpenseData } from '@/lib/expense-service';

interface ReviewExpenseDialogProps {
  isMobile: boolean;
  isProcessing: boolean;
  isSaving: boolean;
  extractedData: ExpenseData | null;
  setExtractedData: (data: ExpenseData | null) => void;
  handleSave: () => void;
  originalData: ExpenseData | null;
}

export const ReviewExpenseDialog: React.FC<ReviewExpenseDialogProps> = ({
  isMobile,
  isProcessing,
  isSaving,
  extractedData,
  setExtractedData,
  handleSave,
  originalData,
}) => {
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (originalData && extractedData) {
      // Check if this is new scanned data (has meaningful content)
      const hasScannedContent =
        originalData.lineItems.length > 0 &&
        originalData.lineItems.some((item) => item.description.trim() !== "");

      if (hasScannedContent) {
        // This is new scanned data, mark as dirty immediately since it represents new information to save
        setIsDirty(true);
      } else {
        // This is manual entry, only mark as dirty if data has actually changed
        setIsDirty(
          JSON.stringify(originalData) !== JSON.stringify(extractedData)
        );
      }
    } else {
      setIsDirty(false);
    }
  }, [extractedData, originalData]);

  const handleCloseAttempt = () => {
    if (isDirty && !isSaving && !isProcessing) {
      setIsConfirmationOpen(true);
    } else if (!isSaving) {
      if (isProcessing) {
        console.log("User canceled during processing");
      }
      setExtractedData(null);
    }
  };

  const handleConfirmClose = () => {
    setExtractedData(null);
    setIsConfirmationOpen(false);
    setIsDirty(false);
  };

  const Wrapper = isMobile ? Drawer : Dialog;
  const Content = isMobile ? DrawerContent : DialogContent;
  const Header = isMobile ? DrawerHeader : DialogHeader;
  const Title = isMobile ? DrawerTitle : DialogTitle;
  const Description = isMobile ? DrawerDescription : DialogDescription;
  const Footer = isMobile ? DrawerFooter : DialogFooter;

  return (
    <>
      <Wrapper
        open={isProcessing || !!extractedData}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseAttempt();
          }
        }}
      >
        <Content
          className={isMobile ? "max-h-[85vh]" : "max-w-2xl"}
          onPointerDownOutside={(e) => {
            if (isSaving) e.preventDefault();
            if (isDirty) {
              e.preventDefault();
              handleCloseAttempt();
            }
          }}
          onInteractOutside={(e) => {
            if (isSaving) e.preventDefault();
          }}
        >
          <Header className={isMobile ? "pb-2" : ""}>
            <Title className="text-lg sm:text-xl">
              {isProcessing ? "Analyzing Receipt..." : "Review Expense"}
            </Title>
            <Description className="text-sm">
              {isProcessing
                ? "Please wait while we extract the details from your receipt."
                : "Review and edit the extracted details before saving."}
            </Description>
          </Header>
          {isProcessing ? (
            <div className="flex flex-col items-center justify-center h-48 sm:h-64 space-y-4 px-4">
              <Loader className="h-10 w-10 sm:h-12 sm:w-12 animate-spin text-focal-blue-500" />
              <p className="text-sm sm:text-base text-muted-foreground">
                Our AI is hard at work...
              </p>
            </div>
          ) : (
            extractedData && (
              <div className="px-3 sm:px-4 overflow-y-auto">
                <ExpenseForm
                  value={extractedData}
                  onChange={setExtractedData}
                />
              </div>
            )
          )}
          <Footer className={isMobile ? "pt-2 gap-2" : ""}>
            <Button
              variant="outline"
              disabled={isSaving}
              onClick={handleCloseAttempt}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isProcessing || isSaving || !isDirty}
            >
              {isSaving ? (
                <Loader className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Expense
            </Button>
          </Footer>
        </Content>
      </Wrapper>
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
