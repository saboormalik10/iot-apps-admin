import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import LinearGradient from 'react-native-linear-gradient';
import { lightColors } from '@rneui/base';
import { requestPasswordReset, verifyResetCode, resetPassword } from '../../api/authService';
import { useAuth } from '../../context/AuthContext';

const { width, height } = Dimensions.get('window');

interface ChangePasswordScreenProps {
  navigation: any;
}

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
}

type Step = 'requestEmail' | 'verifyCode' | 'setNewPassword';

const ChangePasswordScreen: React.FC<ChangePasswordScreenProps> = ({ navigation }) => {
  const { logout } = useAuth();

  const [step, setStep] = useState<Step>('requestEmail');

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    code?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});

  const getPasswordStrength = (password: string): PasswordStrength => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score++;

    const strengths: PasswordStrength[] = [
      { score: 0, label: 'Very Weak', color: '#FF6B6B' },
      { score: 1, label: 'Weak', color: '#FF8C42' },
      { score: 2, label: 'Fair', color: '#FFD93D' },
      { score: 3, label: 'Good', color: '#6BCF7F' },
      { score: 4, label: 'Strong', color: '#4CAF50' },
      { score: 5, label: 'Very Strong', color: '#2E7D32' },
    ];
    return strengths[Math.min(score, 5)];
  };

  const validateEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const validateRequestForm = () => {
    const newErrors: typeof errors = {};
    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!validateEmail(email)) {
      newErrors.email = 'Please enter a valid email';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateCodeForm = () => {
    const newErrors: typeof errors = {};
    if (!code.trim()) {
      newErrors.code = 'Reset code is required';
    } else if (!/^\d{6}$/.test(code.trim())) {
      newErrors.code = 'Enter the 6-digit code from your email';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validatePasswordForm = () => {
    const newErrors: typeof errors = {};

    if (!newPassword) {
      newErrors.newPassword = 'New password is required';
    } else if (newPassword.length < 8) {
      newErrors.newPassword = 'Password must be at least 8 characters';
    } else if (!/[A-Z]/.test(newPassword)) {
      newErrors.newPassword = 'Password must contain an uppercase letter';
    } else if (!/[0-9]/.test(newPassword)) {
      newErrors.newPassword = 'Password must contain a number';
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your new password';
    } else if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRequestReset = async () => {
    if (!validateRequestForm()) return;

    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setLoading(false);
      Alert.alert('Check your email', 'We sent a 6-digit code to your email. Enter it below.');
      setStep('verifyCode');
    } catch (error: any) {
      setLoading(false);
      Alert.alert('Error', error?.response?.data?.error?.message || 'Failed to send reset email. Please try again.');
    }
  };

  const handleVerifyCode = async () => {
    if (!validateCodeForm()) return;

    setLoading(true);
    try {
      const { resetToken: token } = await verifyResetCode(email.trim(), code.trim());
      setResetToken(token);
      setLoading(false);
      setStep('setNewPassword');
    } catch (error: any) {
      setLoading(false);
      const status = error?.response?.status;
      if (status === 400) {
        Alert.alert('Invalid code', error?.response?.data?.error?.message || 'That code is incorrect or expired. Please request a new one.');
      } else {
        Alert.alert('Error', 'Failed to verify code. Please try again.');
      }
    }
  };

  const handleResetPassword = async () => {
    if (!validatePasswordForm()) return;

    setLoading(true);
    try {
      await resetPassword(resetToken, newPassword);
      // All existing refresh tokens are revoked server-side after a reset,
      // so clear local session state too and send the user to Login.
      await logout();
      setLoading(false);
      Alert.alert('Success', 'Password changed successfully! Please log in again.', [
        { text: 'OK', onPress: () => navigation.navigate('Login') },
      ]);
    } catch (error: any) {
      setLoading(false);
      const status = error?.response?.status;
      if (status === 400) {
        Alert.alert('Error', error?.response?.data?.error?.message || 'Reset session expired. Please start over.');
        setStep('requestEmail');
      } else {
        Alert.alert('Error', 'Failed to reset password. Please try again.');
      }
    }
  };

  const passwordStrength = getPasswordStrength(newPassword);

  const stepTitle =
    step === 'requestEmail' ? 'Reset Password' : step === 'verifyCode' ? 'Verify Code' : 'New Password';

  const handleBack = () => {
    if (step === 'verifyCode') setStep('requestEmail');
    else if (step === 'setNewPassword') setStep('verifyCode');
    else navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <LinearGradient
          colors={[lightColors.primary, lightColors.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientContainer}
        >
          {/* Header */}
          <View style={styles.headerContainer}>
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{stepTitle}</Text>
            <View style={styles.backButton} />
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Info Card */}
            <View style={styles.infoCard}>
              <View style={styles.infoIconContainer}>
                <Ionicons name="information-circle" size={24} color="#ffffff" />
              </View>
              <Text style={styles.infoText}>
                {step === 'requestEmail' &&
                  "Enter your account email — we'll send you a 6-digit code to reset your password."}
                {step === 'verifyCode' && 'Enter the 6-digit code we emailed you. It expires in 15 minutes.'}
                {step === 'setNewPassword' && 'Choose a strong new password for your account.'}
              </Text>
            </View>

            <View style={styles.formContainer}>
              {step === 'requestEmail' && (
                <>
                  <View style={styles.inputWrapper}>
                    <View style={styles.labelContainer}>
                      <Ionicons name="mail" size={16} color="#fff" />
                      <Text style={styles.label}>Email</Text>
                    </View>
                    <View style={[styles.inputContainer, errors.email && styles.inputError]}>
                      <TextInput
                        style={styles.input}
                        placeholder="Enter your account email"
                        placeholderTextColor="#d3caca"
                        value={email}
                        onChangeText={(text) => {
                          setEmail(text);
                          if (errors.email) setErrors({ ...errors, email: undefined });
                        }}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        editable={!loading}
                      />
                    </View>
                    {errors.email && (
                      <Text style={styles.errorText}>
                        <Ionicons name="alert-circle" size={12} /> {errors.email}
                      </Text>
                    )}
                  </View>

                  <TouchableOpacity
                    style={[styles.changePasswordButton, loading && styles.buttonDisabled]}
                    onPress={handleRequestReset}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <View style={styles.buttonContent}>
                        <Ionicons name="mail" size={18} color="#fff" />
                        <Text style={styles.changePasswordButtonText}>Send Reset Code</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {step === 'verifyCode' && (
                <>
                  <View style={styles.inputWrapper}>
                    <View style={styles.labelContainer}>
                      <Ionicons name="key" size={16} color="#fff" />
                      <Text style={styles.label}>6-Digit Code</Text>
                    </View>
                    <View style={[styles.inputContainer, errors.code && styles.inputError]}>
                      <TextInput
                        style={styles.input}
                        placeholder="123456"
                        placeholderTextColor="#d3caca"
                        value={code}
                        onChangeText={(text) => {
                          setCode(text);
                          if (errors.code) setErrors({ ...errors, code: undefined });
                        }}
                        keyboardType="number-pad"
                        maxLength={6}
                        editable={!loading}
                      />
                    </View>
                    {errors.code && (
                      <Text style={styles.errorText}>
                        <Ionicons name="alert-circle" size={12} /> {errors.code}
                      </Text>
                    )}
                  </View>

                  <TouchableOpacity
                    style={[styles.changePasswordButton, loading && styles.buttonDisabled]}
                    onPress={handleVerifyCode}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <View style={styles.buttonContent}>
                        <Ionicons name="checkmark-circle" size={18} color="#fff" />
                        <Text style={styles.changePasswordButtonText}>Verify Code</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.cancelButton} onPress={handleRequestReset} disabled={loading}>
                    <Text style={styles.cancelButtonText}>Resend Code</Text>
                  </TouchableOpacity>
                </>
              )}

              {step === 'setNewPassword' && (
                <>
                  {/* New Password */}
                  <View style={styles.inputWrapper}>
                    <View style={styles.labelContainer}>
                      <Ionicons name="key" size={16} color="#fff" />
                      <Text style={styles.label}>New Password</Text>
                    </View>
                    <View style={[styles.inputContainer, errors.newPassword && styles.inputError]}>
                      <TextInput
                        style={styles.input}
                        placeholder="Enter your new password"
                        placeholderTextColor="#999"
                        value={newPassword}
                        onChangeText={(text) => {
                          setNewPassword(text);
                          if (errors.newPassword) setErrors({ ...errors, newPassword: undefined });
                        }}
                        secureTextEntry={!showNewPassword}
                        editable={!loading}
                      />
                      <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)} style={styles.eyeIcon}>
                        <Ionicons name={showNewPassword ? 'eye' : 'eye-off'} size={20} color="#667eea" />
                      </TouchableOpacity>
                    </View>

                    {newPassword.length > 0 && (
                      <View style={styles.strengthContainer}>
                        <View style={styles.strengthBars}>
                          {[0, 1, 2, 3, 4].map((index) => (
                            <View
                              key={index}
                              style={[
                                styles.strengthBar,
                                { backgroundColor: index < passwordStrength.score ? passwordStrength.color : '#ddd' },
                              ]}
                            />
                          ))}
                        </View>
                        <Text style={[styles.strengthLabel, { color: passwordStrength.color }]}>
                          {passwordStrength.label}
                        </Text>
                      </View>
                    )}

                    {newPassword.length > 0 && (
                      <View style={styles.requirementsContainer}>
                        <RequirementItem met={newPassword.length >= 8} text="At least 8 characters" />
                        <RequirementItem met={/[A-Z]/.test(newPassword)} text="One uppercase letter" />
                        <RequirementItem met={/[0-9]/.test(newPassword)} text="One number" />
                        <RequirementItem met={/[a-z]/.test(newPassword)} text="One lowercase letter" />
                      </View>
                    )}

                    {errors.newPassword && (
                      <Text style={styles.errorText}>
                        <Ionicons name="alert-circle" size={12} /> {errors.newPassword}
                      </Text>
                    )}
                  </View>

                  {/* Confirm Password */}
                  <View style={styles.inputWrapper}>
                    <View style={styles.labelContainer}>
                      <Ionicons name="key" size={16} color="#fff" />
                      <Text style={styles.label}>Confirm New Password</Text>
                    </View>
                    <View style={[styles.inputContainer, errors.confirmPassword && styles.inputError]}>
                      <TextInput
                        style={styles.input}
                        placeholder="Confirm your new password"
                        placeholderTextColor="#999"
                        value={confirmPassword}
                        onChangeText={(text) => {
                          setConfirmPassword(text);
                          if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: undefined });
                        }}
                        secureTextEntry={!showConfirmPassword}
                        editable={!loading}
                      />
                      <TouchableOpacity
                        onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                        style={styles.eyeIcon}
                      >
                        <Ionicons name={showConfirmPassword ? 'eye' : 'eye-off'} size={20} color="#667eea" />
                      </TouchableOpacity>
                    </View>

                    {confirmPassword.length > 0 && (
                      <View style={styles.matchContainer}>
                        <Ionicons
                          name={newPassword === confirmPassword ? 'checkmark-circle' : 'close-circle'}
                          size={16}
                          color={newPassword === confirmPassword ? '#4CAF50' : '#FF6B6B'}
                        />
                        <Text
                          style={[
                            styles.matchText,
                            { color: newPassword === confirmPassword ? '#4CAF50' : '#FF6B6B' },
                          ]}
                        >
                          {newPassword === confirmPassword ? 'Passwords match' : 'Passwords do not match'}
                        </Text>
                      </View>
                    )}

                    {errors.confirmPassword && (
                      <Text style={styles.errorText}>
                        <Ionicons name="alert-circle" size={12} /> {errors.confirmPassword}
                      </Text>
                    )}
                  </View>

                  <TouchableOpacity
                    style={[styles.changePasswordButton, loading && styles.buttonDisabled]}
                    onPress={handleResetPassword}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <View style={styles.buttonContent}>
                        <Ionicons name="key" size={18} color="#fff" />
                        <Text style={styles.changePasswordButtonText}>Reset Password</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()} disabled={loading}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.securityTipsContainer}>
              <Text style={styles.securityTipsTitle}>Security Tips:</Text>
              <TipItem icon="shield-checkmark" text="Use a mix of uppercase, lowercase, numbers, and symbols" />
              <TipItem icon="shield-checkmark" text="Avoid using personal information" />
              <TipItem icon="shield-checkmark" text="Don't reuse passwords from other accounts" />
              <TipItem icon="shield-checkmark" text="Change your password regularly" />
            </View>
          </ScrollView>
        </LinearGradient>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

interface RequirementItemProps {
  met: boolean;
  text: string;
}

const RequirementItem: React.FC<RequirementItemProps> = ({ met, text }) => (
  <View style={styles.requirementItem}>
    <Ionicons name={met ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={met ? '#4CAF50' : '#999'} />
    <Text style={[styles.requirementText, { color: met ? '#4CAF50' : '#999' }]}>{text}</Text>
  </View>
);

interface TipItemProps {
  icon: string;
  text: string;
}

const TipItem: React.FC<TipItemProps> = ({ icon, text }) => (
  <View style={styles.tipItem}>
    <Ionicons name={icon} size={16} color="#fff" />
    <Text style={styles.tipText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: lightColors.primary },
  container: { flex: 1 },
  gradientContainer: { flex: 1 },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  scrollContent: { flexGrow: 1, paddingHorizontal: width * 0.05, paddingVertical: height * 0.02 },
  infoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    padding: 14,
    marginBottom: height * 0.025,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  infoIconContainer: { marginRight: 12 },
  infoText: { flex: 1, fontSize: 12, color: 'rgba(255, 255, 255, 0.9)', lineHeight: 18 },
  formContainer: { marginBottom: height * 0.02 },
  inputWrapper: { marginBottom: height * 0.022 },
  labelContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#fff', marginLeft: 6 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  inputError: { borderColor: lightColors.error },
  input: { flex: 1, fontSize: 13, color: '#333', paddingVertical: 10 },
  eyeIcon: { padding: 8, marginLeft: 8 },
  errorText: { color: lightColors.error, fontSize: 11, marginTop: 5, fontWeight: '500' },
  strengthContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 },
  strengthBars: { flexDirection: 'row', gap: 4, flex: 1 },
  strengthBar: { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: 11, fontWeight: '600' },
  requirementsContainer: {
    marginTop: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 10,
  },
  requirementItem: { flexDirection: 'row', alignItems: 'center', marginVertical: 4, gap: 8 },
  requirementText: { fontSize: 11, fontWeight: '500' },
  matchContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  matchText: { fontSize: 11, fontWeight: '600' },
  changePasswordButton: {
    backgroundColor: '#fff',
    borderRadius: 10,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: height * 0.02,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  changePasswordButtonText: { fontSize: 15, fontWeight: '700', color: '#667eea' },
  cancelButton: {
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 10,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: height * 0.02,
  },
  cancelButtonText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  securityTipsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: height * 0.03,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  securityTipsTitle: { fontSize: 13, fontWeight: '700', color: '#fff', marginBottom: 12 },
  tipItem: { flexDirection: 'row', alignItems: 'center', marginVertical: 6, gap: 10 },
  tipText: { fontSize: 11, color: 'rgba(255, 255, 255, 0.85)', flex: 1 },
});

export default ChangePasswordScreen;