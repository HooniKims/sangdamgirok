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
    role: "teacher" | "admin"
    name: string
    isLocked?: boolean
    failedLoginAttempts?: number
    lockedAt?: unknown
    unlockedAt?: unknown
    unlockedBy?: string
    createdAt?: unknown
    updatedAt?: unknown
}
