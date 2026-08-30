import React from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  Platform,
} from "react-native";
import { Brand, Fonts } from "@/constants/theme";
import Icon from "@/components/Icon";
import { inputStyles as styles } from "../styles/input";
import type { PlannerApi } from "../hooks/useTripPlanner";

let DateTimePicker: any = null;
if (Platform.OS !== "web") {
  DateTimePicker = require("@react-native-community/datetimepicker").default;
}

export function WebInputModal({ planner }: { planner: PlannerApi }) {
  const {
    showWebInput,
    setShowWebInput,
    formData,
    handleWebInputChange,
    generateDateOptions,
    generateTimeOptions,
    theme,
    t,
  } = planner;
  if (!showWebInput) return null;
  const isDate = showWebInput === "startDate" || showWebInput === "endDate";
  const title =
    showWebInput === "startDate"
      ? t("trip.startDate")
      : showWebInput === "endDate"
        ? t("trip.endDate")
        : showWebInput === "startTime"
          ? t("trip.startTime")
          : t("trip.endTime");
  const currentValue =
    showWebInput === "startDate"
      ? formData.startDate
      : showWebInput === "endDate"
        ? formData.endDate
        : showWebInput === "startTime"
          ? formData.startTime
          : formData.endTime;
  const options = isDate ? generateDateOptions() : generateTimeOptions();

  return (
    <Modal visible transparent animationType="fade">
      <Pressable
        style={styles.pickerModalOverlay}
        onPress={() => setShowWebInput(null)}
      >
        <View
          style={[
            styles.webPickerModal,
            { backgroundColor: theme.backgroundRoot },
          ]}
        >
          <View style={styles.webPickerHeader}>
            <Pressable onPress={() => setShowWebInput(null)}>
              <Text
                style={[styles.pickerCancel, { color: theme.textSecondary }]}
              >
                {t("common.cancel")}
              </Text>
            </Pressable>
            <Text style={[styles.pickerTitle, { color: theme.text }]}>
              {title}
            </Text>
            <Pressable onPress={() => setShowWebInput(null)}>
              <Text style={[styles.pickerConfirm, { color: Brand.primary }]}>
                {t("common.confirm")}
              </Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.webPickerScroll}
            showsVerticalScrollIndicator={false}
          >
            {options.map((option) => {
              const isSelected = option === currentValue;
              return (
                <Pressable
                  key={option}
                  style={[
                    styles.webPickerOption,
                    isSelected
                      ? { backgroundColor: `${Brand.primary}15` }
                      : undefined,
                  ]}
                  onPress={() => {
                    handleWebInputChange(option);
                    setShowWebInput(null);
                  }}
                >
                  <Text
                    style={[
                      styles.webPickerOptionText,
                      { color: isSelected ? Brand.primary : theme.text },
                      isSelected ? { fontFamily: Fonts.bold } : undefined,
                    ]}
                  >
                    {option}
                  </Text>
                  {isSelected ? (
                    <Icon name="check" size={20} color={Brand.primary} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

export function NativePicker({ planner }: { planner: PlannerApi }) {
  const {
    pickerMode,
    setPickerMode,
    tempDate,
    confirmPicker,
    handlePickerChange,
    theme,
    t,
  } = planner;
  if (!pickerMode || Platform.OS === "web" || !DateTimePicker) return null;
  const isDate = pickerMode === "startDate" || pickerMode === "endDate";
  const mode = isDate ? "date" : "time";
  const title =
    pickerMode === "startDate"
      ? t("trip.startDate")
      : pickerMode === "endDate"
        ? t("trip.endDate")
        : pickerMode === "startTime"
          ? t("trip.startTime")
          : t("trip.endTime");

  if (Platform.OS === "ios") {
    return (
      <Modal visible transparent animationType="slide">
        <View style={styles.pickerModalOverlay}>
          <View
            style={[
              styles.pickerModalContent,
              { backgroundColor: theme.backgroundRoot },
            ]}
          >
            <View style={styles.pickerHeader}>
              <Pressable onPress={() => setPickerMode(null)}>
                <Text
                  style={[styles.pickerCancel, { color: theme.textSecondary }]}
                >
                  {t("common.cancel")}
                </Text>
              </Pressable>
              <Text style={[styles.pickerTitle, { color: theme.text }]}>
                {title}
              </Text>
              <Pressable onPress={() => confirmPicker()}>
                <Text style={[styles.pickerConfirm, { color: Brand.primary }]}>
                  {t("common.confirm")}
                </Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={tempDate}
              mode={mode}
              display="spinner"
              onChange={handlePickerChange}
              locale="ko-KR"
              style={{ height: 200 }}
            />
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <DateTimePicker
      value={tempDate}
      mode={mode}
      display="default"
      onChange={handlePickerChange}
    />
  );
}
