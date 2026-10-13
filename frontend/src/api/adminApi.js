import axiosInstance from './axiosInstance';

export const getAdminStats = () => axiosInstance.get('/admin/stats');
