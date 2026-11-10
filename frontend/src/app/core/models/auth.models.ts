export type UserRole = 'admin' | 'trainer' | 'member';
export type UserGender = 'male' | 'female' | 'other';

export interface User {
  _id: string;
  fullName: string;
  email: string;
  phone: string;
  gender: UserGender;
  dateOfBirth: string;
  role: UserRole;
  profileImage?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  gender: UserGender;
  dateOfBirth: string;
  role: 'member' | 'trainer';
  profileImage?: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  token: string;
  data: User;
}

export interface UserProfileResponse {
  success: boolean;
  data: User;
}

export interface ApiErrorResponse {
  success: boolean;
  message: string;
  errors?: string[];
}

