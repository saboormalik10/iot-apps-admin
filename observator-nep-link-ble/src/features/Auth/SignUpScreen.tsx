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
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Dropdown } from 'react-native-element-dropdown';
import LinearGradient from 'react-native-linear-gradient';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { signUp } from '../../api/authService';
import { lightColors } from '@rneui/base';

const { width, height } = Dimensions.get('window');

interface SignUpScreenProps {
  navigation: any;
}

const appTypeOptions = [
  { label: 'MET-LINK', value: 'MET_LINK' },
  { label: 'NEP-LINK', value: 'NEP_LINK' },
];

const SignUpScreen: React.FC<SignUpScreenProps> = ({ navigation }) => {
  const { login } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [appType, setAppType] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [errors, setErrors] = useState<{
    firstName?: string;
    lastName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    appType?: string;
  }>({});

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = () => {
    const newErrors: typeof errors = {};

    if (!firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }

    if (!lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!validateEmail(email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    } else if (!/[A-Z]/.test(password)) {
      newErrors.password = 'Password must contain an uppercase letter';
    } else if (!/[0-9]/.test(password)) {
      newErrors.password = 'Password must contain a number';
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (!appType) {
      newErrors.appType = 'Please select an application type';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignUp = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const { user, accessToken, refreshToken } = await signUp(
        email,
        password,
        firstName,
        lastName,
        appType as 'MET-LINK' | 'NEP-LINK'
      );
      await login(accessToken, refreshToken, user);
      // No navigation call needed — RootNav swaps AuthStack -> MainTabs automatically
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 409) {
        Alert.alert('Account exists', 'This email is already registered. Try logging in instead.');
      } else if (status === 400) {
        Alert.alert('Check your details', error?.response?.data?.error?.message || 'Please check the form and try again.');
      } else {
        Alert.alert('Error', 'Failed to create account. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };
  const renderAppTypeLabel = () => {
    if (appType) {
      const selected = appTypeOptions.find((item) => item.value === appType);
      return selected ? selected.label : 'Select App Type';
    }
    return 'Select App Type';
  };

  return (
    <SafeAreaProvider style={styles.container}>
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
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Header Section */}
            <View style={styles.headerSection}>
              <View style={styles.iconCircle}>
                <Ionicons name="person-add" size={50} color="#fff" />
              </View>
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>Join our healthcare platform</Text>
            </View>

            {/* Form Section */}
            <View style={styles.formContainer}>
              {/* First Name */}
              <View style={styles.inputWrapper}>
                <View style={styles.labelContainer}>
                  <Ionicons name="person" size={16} color="#ffffff" />
                  <Text style={styles.label}>First Name</Text>
                </View>
                <View
                  style={[
                    styles.inputContainer,
                    errors.firstName && styles.inputError,
                  ]}
                >
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your first name"
                    placeholderTextColor="#d3caca"
                    value={firstName}
                    onChangeText={(text) => {
                      setFirstName(text);
                      if (errors.firstName)
                        setErrors({ ...errors, firstName: undefined });
                    }}
                    editable={!loading}
                  />
                </View>
                {errors.firstName && (
                  <Text style={styles.errorText}>
                    <Ionicons name="alert-circle" size={12} color={lightColors.error} /> {errors.firstName}
                  </Text>
                )}
              </View>

              {/* Last Name */}
              <View style={styles.inputWrapper}>
                <View style={styles.labelContainer}>
                  <Ionicons name="person" size={16} color="#ffffff" />
                  <Text style={styles.label}>Last Name</Text>
                </View>
                <View
                  style={[
                    styles.inputContainer,
                    errors.lastName && styles.inputError,
                  ]}
                >
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your last name"
                    placeholderTextColor="#d3caca"
                    value={lastName}
                    onChangeText={(text) => {
                      setLastName(text);
                      if (errors.lastName)
                        setErrors({ ...errors, lastName: undefined });
                    }}
                    editable={!loading}
                  />
                </View>
                {errors.lastName && (
                  <Text style={styles.errorText}>
                    <Ionicons name="alert-circle" size={12} color={lightColors.error} /> {errors.lastName}
                  </Text>
                )}
              </View>

              {/* Email */}
              <View style={styles.inputWrapper}>
                <View style={styles.labelContainer}>
                  <Ionicons name="mail" size={16} color="#ffffff" />
                  <Text style={styles.label}>Email</Text>
                </View>
                <View
                  style={[
                    styles.inputContainer,
                    errors.email && styles.inputError,
                  ]}
                >
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your email"
                    placeholderTextColor="#d3caca"
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      if (errors.email) setErrors({ ...errors, email: undefined });
                    }}
                    keyboardType="email-address"
                    editable={!loading}
                  />
                </View>
                {errors.email && (
                  <Text style={styles.errorText}>
                    <Ionicons name="alert-circle" size={12} color={lightColors.error} /> {errors.email}
                  </Text>
                )}
              </View>

              {/* Password */}
              <View style={styles.inputWrapper}>
                <View style={styles.labelContainer}>
                  <Ionicons name="key" size={16} color="#ffffff" />
                  <Text style={styles.label}>Password</Text>
                </View>
                <View
                  style={[
                    styles.inputContainer,
                    errors.password && styles.inputError,
                  ]}
                >
                  <TextInput
                    style={styles.input}
                    placeholder="Create a strong password"
                    placeholderTextColor="#d3caca"
                    value={password}
                    onChangeText={(text) => {
                      setPassword(text);
                      if (errors.password)
                        setErrors({ ...errors, password: undefined });
                    }}
                    secureTextEntry={!showPassword}
                    editable={!loading}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeIcon}
                  >
                    <Ionicons
                      name={showPassword ? 'eye' : 'eye-off'}
                      size={20}
                      color="#667eea"
                    />
                  </TouchableOpacity>
                </View>
                {errors.password && (
                  <Text style={styles.errorText}>
                    <Ionicons name="alert-circle" size={12} color={lightColors.error} /> {errors.password}
                  </Text>
                )}
              </View>

              {/* Confirm Password */}
              <View style={styles.inputWrapper}>
                <View style={styles.labelContainer}>
                  <Ionicons name="key" size={16} color="#ffffff" />
                  <Text style={styles.label}>Confirm Password</Text>
                </View>
                <View
                  style={[
                    styles.inputContainer,
                    errors.confirmPassword && styles.inputError,
                  ]}
                >
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm your password"
                    placeholderTextColor="#d3caca"
                    value={confirmPassword}
                    onChangeText={(text) => {
                      setConfirmPassword(text);
                      if (errors.confirmPassword)
                        setErrors({ ...errors, confirmPassword: undefined });
                    }}
                    secureTextEntry={!showConfirmPassword}
                    editable={!loading}
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={styles.eyeIcon}
                  >
                    <Ionicons
                      name={showConfirmPassword ? 'eye' : 'eye-off'}
                      size={20}
                      color="#667eea"
                    />
                  </TouchableOpacity>
                </View>
                {errors.confirmPassword && (
                  <Text style={styles.errorText}>
                    <Ionicons name="alert-circle" size={12} /> {errors.confirmPassword}
                  </Text>
                )}
              </View>

              {/* App Type Dropdown */}
              <View style={styles.inputWrapper}>
                <View style={styles.labelContainer}>
                  <Ionicons name="apps" size={16} color="#ffffff" />
                  <Text style={styles.label}>Application Type</Text>
                </View>
                <Dropdown
                  style={[
                    styles.dropdown,
                    isFocused && styles.dropdownFocused,
                    errors.appType && styles.dropdownError,
                  ]}
                  placeholderStyle={styles.placeholderStyle}
                  selectedTextStyle={styles.selectedTextStyle}
                  inputSearchStyle={styles.inputSearchStyle}
                  iconStyle={styles.iconStyle}
                  data={appTypeOptions}
                  search={false}
                  maxHeight={200}
                  labelField="label"
                  valueField="value"
                  placeholder={!isFocused ? 'Select App Type' : '...'}
                  value={appType}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  onChange={(item) => {
                    setAppType(item.value);
                    if (errors.appType) setErrors({ ...errors, appType: undefined });
                    setIsFocused(false);
                  }}
                  renderLeftIcon={() => (
                    <Ionicons
                      style={styles.icon}
                      color={isFocused ? '#667eea' : '#999'}
                      name="apps"
                      size={20}
                    />
                  )}
                />
                {errors.appType && (
                  <Text style={styles.errorText}>
                    <Ionicons name="alert-circle" size={12} color={lightColors.error} /> {errors.appType}
                  </Text>
                )}
              </View>

              {/* Sign Up Button */}
              <TouchableOpacity
                style={[styles.signupButton, loading && styles.buttonDisabled]}
                onPress={handleSignUp}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <View style={styles.buttonContent}>
                    <Text style={styles.signupButtonText}>Create Account</Text>
                    <Ionicons name="arrow-forward" size={18} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Login Link */}
            <View style={styles.loginContainer}>
              <Text style={styles.loginText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={styles.loginLink}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </LinearGradient>
      </KeyboardAvoidingView>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradientContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingVertical: height * 0.02,
  },
  headerSection: {
    alignItems: 'center',
    marginTop: height * 0.03,
    marginBottom: height * 0.03,
  },
  iconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },
  formContainer: {
    marginHorizontal: width * 0.05,
    marginVertical: height * 0.015,
  },
  inputWrapper: {
    marginBottom: height * 0.02,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 6,
  },
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
  inputError: {
    borderColor: lightColors.error,
  },
  input: {
    flex: 1,
    fontSize: 13,
    color: '#333',
    paddingVertical: 10,
  },
  eyeIcon: {
    padding: 8,
    marginLeft: 8,
  },
  errorText: {
    color: lightColors.error,
    fontSize: 12,
    marginTop: 6,
    fontWeight: '500',
  },
  dropdown: {
    height: 48,
    borderColor: 'transparent',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },
  dropdownFocused: {
    borderColor: '#ffffff',
  },
  dropdownError: {
    borderColor: lightColors.error,
    // backgroundColor: 'rgba(255, 107, 107, 0.05)',
  },
  placeholderStyle: {
    fontSize: 13,
    color: '#d3caca',
  },
  selectedTextStyle: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  inputSearchStyle: {
    height: 40,
    fontSize: 13,
    borderRadius: 8,
    borderColor: '#d3caca',
    borderWidth: 1,
  },
  iconStyle: {
    width: 20,
    height: 20,
  },
  icon: {
    marginRight: 5,
  },
  signupButton: {
    backgroundColor: '#fff',
    borderRadius: 10,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: height * 0.02,
    marginBottom: height * 0.02,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signupButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#667eea',
    marginRight: 8,
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: height * 0.02,
  },
  loginText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
  },
  loginLink: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});

export default SignUpScreen;