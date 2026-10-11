import axiosInstance from './axiosInstance';

export const enrollInCourse      = (courseId)              => axiosInstance.post(`/enrollments/${courseId}`);
export const getMyEnrollments    = ()                      => axiosInstance.get('/enrollments/my-courses');
export const getEnrollmentById   = (id)                    => axiosInstance.get(`/enrollments/${id}`);
export const updateProgress      = (id, completedModules)  => axiosInstance.put(`/enrollments/${id}/progress`, { completedModules });
export const downloadCertificate = (id)                    => axiosInstance.get(`/enrollments/${id}/certificate`, { responseType: 'blob' });
