import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Camera, Upload, PenLine, Plus, Mic, FileAudio } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { AudioRecorder } from './AudioRecorder';

interface AddExpenseMenuProps {
  onScan: () => void;
  onUploadImage: (file: File) => void;
  onAudioComplete: (blob: Blob) => void;
  onManualEntry: () => void;
  isProcessing: boolean;
}

export const AddExpenseMenu: React.FC<AddExpenseMenuProps> = ({
  onScan,
  onUploadImage,
  onAudioComplete,
  onManualEntry,
  isProcessing,
}) => {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadImage(file);
      setOpen(false);
    }
  };

  const handleScan = () => {
    onScan();
    setOpen(false);
  };

  const handleManual = () => {
    onManualEntry();
    setOpen(false);
  };

  const handleAudio = (blob: Blob) => {
    onAudioComplete(blob);
    setOpen(false);
  };

  const Content = (
    <div className="grid gap-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <Button
          variant="outline"
          className="h-24 flex flex-col items-center justify-center gap-2"
          onClick={handleScan}
          disabled={isProcessing}
        >
          <Camera className="h-8 w-8" />
          <span>Scan Receipt</span>
        </Button>
        <Button
          variant="outline"
          className="h-24 flex flex-col items-center justify-center gap-2"
          onClick={() => imageInputRef.current?.click()}
          disabled={isProcessing}
        >
          <Upload className="h-8 w-8" />
          <span>Upload Image</span>
        </Button>
        <div className="col-span-2 border rounded-md p-4 flex flex-col items-center justify-center gap-2 bg-muted/20">
           <span className="text-sm font-medium mb-2">Voice Expense</span>
           <AudioRecorder 
             onRecordingComplete={handleAudio}
             isProcessing={isProcessing}
           />
        </div>
        <Button
          variant="outline"
          className="col-span-2 h-16 flex items-center justify-center gap-2"
          onClick={handleManual}
          disabled={isProcessing}
        >
          <PenLine className="h-5 w-5" />
          <span>Manual Entry</span>
        </Button>
      </div>
      <input
        type="file"
        ref={imageInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleImageUpload}
      />
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <Button size="icon" className="h-10 w-10 rounded-full shadow-lg bg-focal-blue-500 hover:bg-focal-blue-600 text-white">
            <Plus className="h-6 w-6" />
          </Button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Add Expense</DrawerTitle>
            <DrawerDescription>
              Choose how you want to add your expense.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-8">
            {Content}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-focal-blue-500 hover:bg-focal-blue-600 text-white shadow-sm">
          <Plus className="h-4 w-4" />
          Add Expense
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
          <DialogDescription>
            Choose how you want to add your expense.
          </DialogDescription>
        </DialogHeader>
        {Content}
      </DialogContent>
    </Dialog>
  );
};
