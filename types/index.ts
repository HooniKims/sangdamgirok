export interface Consultation {
    id?: string
    teacherId?: string
    teacherEmail?: string
    date: string
    time: string
    studentId: string
    studentName: string
    topic?: string
    originalContent?: string
    aiSummary?: string
    createdAt?: unknown
    updatedAt?: unknown
}

export interface TeacherProfile {
    uid: string
    email: string
    role: "teacher"
    name: string
    createdAt?: unknown
    updatedAt?: unknown
}
