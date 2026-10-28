import React, { useState, useRef, useCallback, useEffect } from "react";
import Webcam from "react-webcam";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  X,
  Loader,
  Save,
  Lightbulb,
  Upload,
  PenLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
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
  DrawerFooter,
  DrawerClose,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Toaster, toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useExpenseCreation } from "@/hooks/useExpenseCreation";
import { ReviewExpenseDialog } from "@/components/ReviewExpenseDialog";
import { AudioRecorder } from "@/components/AudioRecorder";
import { ReceiptReviewDialog } from "@/components/ReceiptReviewDialog";
import { ExpenseData } from "@/lib/expense-service";
import { Mic } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { EmailVerificationBanner } from "@/components/EmailVerificationBanner";
import { CurrencyBanner } from "@/components/CurrencyBanner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
const videoConstraints = {
  width: 1280,
  height: 720,
  facingMode: "environment",
};

// Hoisted to keep identity stable and avoid remount/focus loss

export const HomePage: React.FC = () => {
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [audioReceipts, setAudioReceipts] = useState<ExpenseData[]>([]);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);

  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAuth();

  const {
    isProcessing,
    isSaving,
    extractedData,
    setExtractedData,
    originalData,
    error,
    setError,
    handleImageProcessing,
    handleAudioProcessing,
    handleManualEntry,
    handleSave,
  } = useExpenseCreation();

  const onSaveSuccess = async () => {
    const success = await handleSave();
    if (success) {
      navigate("/expenses");
    }
  };

  const handleAudioComplete = async (blob: Blob) => {
    const results = await handleAudioProcessing(blob);
    if (results && results.length > 0) {
      setAudioReceipts(results);
      setIsReviewDialogOpen(true);
      setShowAudioRecorder(false);
    }
  };

  const handleReviewSaveComplete = () => {
    navigate("/expenses");
  };
  const capture = useCallback(async () => {
    if (webcamRef.current && !isProcessing) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        setIsCameraOpen(false);
        handleImageProcessing(imageSrc);
      }
    }
  }, [webcamRef, isProcessing]);
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && !isProcessing) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Image = e.target?.result as string;
        if (base64Image) {
          handleImageProcessing(base64Image);
        }
      };
      reader.onerror = () => {
        toast.error("Upload Error", {
          description: "Failed to read the image file.",
        });
      };
      reader.readAsDataURL(file);
    }
    // Reset the input so the same file can be selected again
    event.target.value = "";
  };

  return (
    <>
      <Toaster richColors position="top-center" />
      <div className="relative flex-grow flex flex-col items-center justify-center bg-background text-foreground px-3 sm:px-4 py-8 overflow-hidden w-full">
        <div className="absolute inset-0 -z-10 h-full w-full bg-white bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] bg-[size:6rem_4rem] dark:bg-neutral-950 dark:bg-[linear-gradient(to_right,#1f1f1f_1px,transparent_1px),linear-gradient(to_bottom,#1f1f1f_1px,transparent_1px)]"></div>
        <div className="absolute inset-0 bg-hero-gradient -z-10" />

        {/* Email Verification Banner */}
        {user && user.emailVerified === false && (
          <div className="w-full max-w-4xl mb-6 z-20">
            <EmailVerificationBanner />
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="text-center space-y-4 sm:space-y-6 z-10 w-full max-w-4xl"
        >
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-6xl xl:text-7xl font-display font-bold text-balance leading-tight px-2">
            Scan, Review, Done.
          </h1>
          <p className="text-sm sm:text-base md:text-lg lg:text-xl text-muted-foreground max-w-2xl mx-auto text-pretty px-2 sm:px-4">
            Instantly capture, analyze, and organize your expenses with a single
            photo. The fastest way to track your spending.
          </p>

          {/* Currency Banner */}
          <div className="w-full max-w-2xl mx-auto px-2 sm:px-4">
            <CurrencyBanner />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full max-w-2xl mx-auto px-2 sm:px-4">
            <Button
              size="lg"
              onClick={() => {
                if (!isProcessing && !isSaving) {
                  setError(null);
                  setIsCameraOpen(true);
                }
              }}
              disabled={isProcessing || isSaving}
              className="bg-focal-blue-500 hover:bg-focal-blue-600 text-white h-auto py-6 text-base sm:text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex flex-col gap-2"
            >
              {isProcessing ? (
                <Loader className="h-8 w-8 animate-spin" />
              ) : (
                <Camera className="h-8 w-8" />
              )}
              <span>Scan Receipt</span>
            </Button>

            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                if (!isProcessing && !isSaving) {
                  setError(null);
                  fileInputRef.current?.click();
                }
              }}
              disabled={isProcessing || isSaving}
              className="h-auto py-6 text-base sm:text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex flex-col gap-2"
            >
              <Upload className="h-8 w-8" />
              <span>Upload Photo</span>
            </Button>

            {showAudioRecorder ? (
              <div className="col-span-1 sm:col-span-2 bg-card border rounded-xl p-4 shadow-lg flex flex-col items-center justify-center gap-2 animate-in fade-in zoom-in duration-300">
                <span className="text-sm font-medium">
                  Record or Upload Voice Note
                </span>
                <AudioRecorder
                  onRecordingComplete={handleAudioComplete}
                  isProcessing={isProcessing}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAudioRecorder(false)}
                  className="mt-2 text-xs text-muted-foreground"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                size="lg"
                variant="outline"
                onClick={() => setShowAudioRecorder(true)}
                disabled={isProcessing || isSaving}
                className="col-span-1 sm:col-span-2 h-auto py-6 text-base sm:text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex flex-col gap-2"
              >
                <Mic className="h-8 w-8" />
                <span>Voice Expense</span>
              </Button>
            )}

            <Button
              size="lg"
              variant="ghost"
              onClick={handleManualEntry}
              disabled={isProcessing || isSaving}
              className="col-span-1 sm:col-span-2 h-auto py-4 text-base font-medium text-muted-foreground hover:text-foreground"
            >
              <PenLine className="mr-2 h-4 w-4" />
              Or enter manually
            </Button>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              className="hidden"
            />
          </div>
        </motion.div>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 sm:mt-8 max-w-md w-full px-4"
          >
            <Alert variant="destructive">
              <AlertTitle>Processing Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </motion.div>
        )}
      </div>
      <AnimatePresence>
        {isCameraOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4"
          >
            <div className="relative w-full max-w-4xl">
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={videoConstraints}
                className="rounded-lg shadow-2xl w-full"
              />
              <div className="absolute bottom-4 left-4 right-4 bg-black/50 text-white p-3 rounded-lg text-sm flex items-center gap-3">
                <Lightbulb className="h-5 w-5 text-yellow-300 flex-shrink-0" />
                <span>
                  For best results: ensure good lighting and place the receipt
                  on a flat, contrasting surface.
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-6">
              <Button
                onClick={capture}
                disabled={isProcessing}
                className="w-20 h-20 rounded-full bg-white hover:bg-gray-200 ring-4 ring-white ring-offset-4 ring-offset-black/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <Loader className="h-10 w-10 text-black animate-spin" />
                ) : (
                  <Camera className="h-10 w-10 text-black" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => !isProcessing && setIsCameraOpen(false)}
                disabled={isProcessing}
                className="absolute top-6 right-6 text-white hover:bg-white/20 w-12 h-12 rounded-full disabled:opacity-50"
              >
                <X className="h-8 w-8" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <ReviewExpenseDialog
        isMobile={isMobile}
        isProcessing={isProcessing}
        isSaving={isSaving}
        extractedData={extractedData}
        setExtractedData={setExtractedData}
        handleSave={onSaveSuccess}
        originalData={originalData}
      />
      <ReceiptReviewDialog
        open={isReviewDialogOpen}
        onOpenChange={setIsReviewDialogOpen}
        receipts={audioReceipts}
        onSaveComplete={handleReviewSaveComplete}
      />
    </>
  );
};
