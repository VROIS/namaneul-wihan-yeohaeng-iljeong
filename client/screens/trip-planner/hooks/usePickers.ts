import { useState } from "react";
import { Platform } from "react-native";
import { TripFormData } from "@/types/trip";
import { formatDate, formatTime, parseDate, parseTime } from "../utils";

export type PickerMode =
  | "startDate"
  | "startTime"
  | "endDate"
  | "endTime"
  | null;

export function usePickers({
  formData,
  setFormData,
}: {
  formData: TripFormData;
  setFormData: React.Dispatch<React.SetStateAction<TripFormData>>;
}) {
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [tempDate, setTempDate] = useState(new Date());
  const [showWebInput, setShowWebInput] = useState<PickerMode>(null);

  const openPicker = (mode: PickerMode) => {
    if (!mode) return;
    if (Platform.OS === "web") {
      setShowWebInput(mode);
      return;
    }
    let initialDate = new Date();
    if (mode === "startDate") initialDate = parseDate(formData.startDate);
    else if (mode === "endDate") initialDate = parseDate(formData.endDate);
    else if (mode === "startTime") initialDate = parseTime(formData.startTime);
    else if (mode === "endTime") initialDate = parseTime(formData.endTime);
    setTempDate(initialDate);
    setPickerMode(mode);
  };

  const handlePickerChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setPickerMode(null);
    }
    if (selectedDate) {
      setTempDate(selectedDate);
      if (Platform.OS === "android") {
        confirmPicker(selectedDate);
      }
    }
  };

  const confirmPicker = (date?: Date) => {
    const finalDate = date || tempDate;
    if (pickerMode === "startDate") {
      setFormData((prev) => ({ ...prev, startDate: formatDate(finalDate) }));
    } else if (pickerMode === "endDate") {
      setFormData((prev) => ({ ...prev, endDate: formatDate(finalDate) }));
    } else if (pickerMode === "startTime") {
      setFormData((prev) => ({ ...prev, startTime: formatTime(finalDate) }));
    } else if (pickerMode === "endTime") {
      setFormData((prev) => ({ ...prev, endTime: formatTime(finalDate) }));
    }
    setPickerMode(null);
  };

  const handleWebInputChange = (value: string) => {
    if (showWebInput === "startDate") {
      setFormData((prev) => ({ ...prev, startDate: value }));
    } else if (showWebInput === "endDate") {
      setFormData((prev) => ({ ...prev, endDate: value }));
    } else if (showWebInput === "startTime") {
      setFormData((prev) => ({ ...prev, startTime: value }));
    } else if (showWebInput === "endTime") {
      setFormData((prev) => ({ ...prev, endTime: value }));
    }
  };
  const generateDateOptions = () => {
    const options: string[] = [];
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
      options.push(formatDate(d));
    }
    return options;
  };

  const generateTimeOptions = () => {
    const options: string[] = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 30) {
        options.push(
          `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        );
      }
    }
    return options;
  };

  return {
    pickerMode,
    setPickerMode,
    tempDate,
    showWebInput,
    setShowWebInput,
    openPicker,
    handlePickerChange,
    confirmPicker,
    handleWebInputChange,
    generateDateOptions,
    generateTimeOptions,
  };
}
