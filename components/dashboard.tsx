"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { onAuthStateChanged, signOut, deleteUser } from "firebase/auth"
import { collection, addDoc, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from "firebase/firestore"
import { auth, db } from "@/lib/firebase"
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, getDay } from "date-fns"
import { ko } from "date-fns/locale"
import {
    ChevronLeft,
    ChevronRight,
    Search,
    LogOut,
    User,
    FileText,
    BarChart3,
    Clock,
    Trash2,
    Sparkles,
    ShieldCheck,
    Download,
    PencilLine,
    Sun,
    Moon,
    Menu,
    X,
    AlertTriangle,
    Copy
} from "lucide-react"
import { Consultation, TeacherProfile } from "@/types"
import { generateWithRetry, AVAILABLE_MODELS, DEFAULT_MODEL } from "@/utils/ollamaClient"
import { cleanMetaInfo } from "@/utils/textProcessor"
import { buildEmailLockKey, normalizeEmail } from "@/utils/authLock"
import { useTheme } from "@/components/ThemeProvider"
import {
    buildBehaviorRewritePrompt,
    buildStudentBehaviorPrompt,
    MAX_BEHAVIOR_REWRITE_ATTEMPTS,
    normalizeBehaviorDraftText,
    STUDENT_BEHAVIOR_SYSTEM_MESSAGE,
    type BehaviorEvidenceMode,
    validateBehaviorDraft,
} from "@/utils/behaviorRecordPrompt"

const HOLIDAYS: { [key: string]: string } = {
    "01-01": "신정",
    "03-01": "3.1절",
    "05-05": "어린이날",
    "06-06": "현충일",
    "08-15": "광복절",
    "10-03": "개천절",
    "10-09": "한글날",
    "12-25": "크리스마스",
    "2024-02-09": "설날",
    "2024-02-10": "설날",
    "2024-02-11": "설날",
    "2024-02-12": "대체공휴일",
    "2024-09-16": "추석",
    "2024-09-17": "추석",
    "2024-09-18": "추석",
    "2025-01-28": "설날",
    "2025-01-29": "설날",
    "2025-01-30": "설날",
    "2025-10-06": "추석",
    "2025-10-07": "추석",
}

// --- Markdown Renderer Component ---
const MarkdownRenderer = ({ content }: { content: string }) => {
    if (!content) return null;

    const parseBold = (text: string) => {
        const parts = text.split(/(\*\*.*?\*\*)/g);
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={i} className="font-bold text-gray-900">{part.slice(2, -2)}</strong>;
            }
            return part;
        });
    };

    const lines = content.split('\n');

    return (
        <div className="markdown-content text-sm text-gray-800">
            {lines.map((line, index) => {
                const trimmed = line.trim();
                if (trimmed.startsWith('### ')) return <h4 key={index} className="font-bold mt-3 mb-1 text-gray-800">{trimmed.replace('### ', '')}</h4>;
                if (trimmed.startsWith('## ')) return <h3 key={index} className="font-bold text-lg mt-4 mb-2 text-primary border-b pb-1">{trimmed.replace('## ', '')}</h3>;
                if (trimmed.startsWith('# ')) return <h2 key={index} className="font-bold text-xl mt-4 mb-2 text-gray-900">{trimmed.replace('# ', '')}</h2>;

                if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                    return (
                        <div key={index} className="flex gap-2 pl-2 mb-1">
                            <span className="bg-primary rounded-full flex-shrink-0" style={{ marginTop: '6px', width: '6px', height: '6px' }}></span>
                            <span className="leading-relaxed">{parseBold(trimmed.replace(/^[\*\-]\s/, ''))}</span>
                        </div>
                    );
                }

                if (trimmed === '') return <div key={index} style={{ height: '8px' }} />;

                return <p key={index} className="leading-relaxed mb-1">{parseBold(line)}</p>;
            })}
        </div>
    );
};

type StudentSortOption = "date_desc" | "student_id_asc" | "student_id_desc"
type BulkDeleteMode = "selected_students" | "all"
type BehaviorGenerationMode = "selected_students" | "all"
type BehaviorDraftStatus = "pending" | "generating" | "completed" | "failed"

type StudentGroup = {
    key: string
    name: string
    id: string
    count: number
    lastDate: string
    lastTime: string
    consultations: Consultation[]
}

type StudentBehaviorDraft = {
    studentKey: string
    studentName: string
    studentId: string
    consultationCount: number
    lastDate: string
    lastTime: string
    content: string
    status: BehaviorDraftStatus
    errorMessage?: string
    modelId?: string
    generatedAt?: string
}

type BehaviorGenerationProgress = {
    total: number
    completed: number
    failed: number
}

type ConsultationEditForm = {
    time: string
    studentId: string
    studentName: string
    topic: string
    content: string
}

const compareConsultationByDateDesc = (a: Consultation, b: Consultation) => {
    const byDate = b.date.localeCompare(a.date)
    if (byDate !== 0) return byDate
    return b.time.localeCompare(a.time)
}

const compareStudentId = (a: string, b: string) =>
    a.localeCompare(b, "ko", { numeric: true, sensitivity: "base" })

const createBehaviorDraftFromGroup = (group: StudentGroup): StudentBehaviorDraft => ({
    studentKey: group.key,
    studentName: group.name,
    studentId: group.id,
    consultationCount: group.count,
    lastDate: group.lastDate,
    lastTime: group.lastTime,
    content: "",
    status: "pending",
})

const upsertBehaviorDraft = (drafts: StudentBehaviorDraft[], nextDraft: StudentBehaviorDraft) => {
    const targetIndex = drafts.findIndex(item => item.studentKey === nextDraft.studentKey)
    if (targetIndex === -1) return [...drafts, nextDraft]
    const next = [...drafts]
    next[targetIndex] = nextDraft
    return next
}

const getBehaviorStatusLabel = (status: BehaviorDraftStatus) => {
    if (status === "completed") return "완료"
    if (status === "failed") return "실패"
    if (status === "generating") return "생성 중"
    return "대기"
}

const buildBehaviorRuleErrorMessage = (violations: string[]) =>
    `행발 필수 규칙을 충족하지 못했습니다: ${violations.join(" / ") || "세부 사유를 확인할 수 없습니다."}`

const EMPTY_EDIT_FORM: ConsultationEditForm = {
    time: "",
    studentId: "",
    studentName: "",
    topic: "",
    content: "",
}

export default function Dashboard() {
    const { resolvedTheme, setTheme } = useTheme()
    const [currentMonth, setCurrentMonth] = useState(new Date())
    const [selectedDate, setSelectedDate] = useState<Date>(new Date())
    const [consultations, setConsultations] = useState<Consultation[]>([])

    // Navigation State
    const [activeTab, setActiveTab] = useState<"calendar" | "students" | "stats" | "admin">("calendar")
    const [viewMode, setViewMode] = useState<"list" | "write" | "search">("list")

    // Search State
    const [isSearchOpen, setIsSearchOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")

    // Form State
    const [formData, setFormData] = useState({
        time: format(new Date(), "HH:mm"),
        studentId: "",
        studentName: "",
        topic: "",
        content: "",
    })
    const [summary, setSummary] = useState("")
    const [isSummarizing, setIsSummarizing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL)
    const [teacherId, setTeacherId] = useState<string | null>(null)
    const [teacherEmail, setTeacherEmail] = useState("")
    const [teacherRole, setTeacherRole] = useState<TeacherProfile["role"]>("teacher")
    const [teacherName, setTeacherName] = useState("")
    const [teacherCreatedAt, setTeacherCreatedAt] = useState<string>("")
    const [unlockEmail, setUnlockEmail] = useState("")
    const [isUnlocking, setIsUnlocking] = useState(false)
    const [isProfileOpen, setIsProfileOpen] = useState(false)
    const [deleteStep, setDeleteStep] = useState<"idle" | "confirm" | "done">("idle")
    const [isDeleting, setIsDeleting] = useState(false)
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
    const profileRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
                setIsProfileOpen(false)
                setDeleteStep("idle")
            }
        }

        if (isProfileOpen) {
            document.addEventListener("mousedown", handleClickOutside)
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside)
        }
    }, [isProfileOpen])

    // Student List State
    const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null)
    const [studentSortOption, setStudentSortOption] = useState<StudentSortOption>("date_desc")
    const [selectedStudentKeys, setSelectedStudentKeys] = useState<string[]>([])
    const [bulkDeleteMode, setBulkDeleteMode] = useState<BulkDeleteMode>("selected_students")
    const [behaviorGenerationMode, setBehaviorGenerationMode] = useState<BehaviorGenerationMode>("selected_students")
    const [behaviorEvidenceMode, setBehaviorEvidenceMode] = useState<BehaviorEvidenceMode>("all_records")
    const [selectedBehaviorConsultationMap, setSelectedBehaviorConsultationMap] = useState<Record<string, string[]>>({})
    const [behaviorDrafts, setBehaviorDrafts] = useState<StudentBehaviorDraft[]>([])
    const [behaviorProgress, setBehaviorProgress] = useState<BehaviorGenerationProgress>({ total: 0, completed: 0, failed: 0 })
    const [isGeneratingBehavior, setIsGeneratingBehavior] = useState(false)
    const [isExportingBehavior, setIsExportingBehavior] = useState(false)
    const [editingConsultationId, setEditingConsultationId] = useState<string | null>(null)
    const [editFormData, setEditFormData] = useState<ConsultationEditForm>(EMPTY_EDIT_FORM)
    const [isUpdatingConsultation, setIsUpdatingConsultation] = useState(false)

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            setTeacherId(user?.uid ?? null)
            setTeacherEmail(user?.email ?? "")
            if (!user) {
                setTeacherRole("teacher")
            }
        })

        return () => unsubscribeAuth()
    }, [])

    useEffect(() => {
        if (!teacherId) {
            setTeacherRole("teacher")
            return
        }

        const profileRef = doc(db, "users", teacherId)
        const unsubscribeRole = onSnapshot(
            profileRef,
            (snapshot) => {
                const data = snapshot.data();
                const role = data?.role ? String(data.role).toLowerCase() : "teacher";
                setTeacherRole(role === "admin" ? "admin" : "teacher")
                setTeacherName(data?.name ? String(data.name) : "")
                if (data?.createdAt && data.createdAt instanceof Timestamp) {
                    setTeacherCreatedAt(format(data.createdAt.toDate(), "yyyy-MM-dd"))
                } else {
                    setTeacherCreatedAt("")
                }
            },
            (error) => {
                console.error("Role snapshot error:", error)
                setTeacherRole("teacher")
            }
        )

        return () => unsubscribeRole()
    }, [teacherId])

    useEffect(() => {
        if (!teacherId) {
            setConsultations([])
            return
        }

        const q = query(collection(db, "consultations"), where("teacherId", "==", teacherId))
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Consultation))
            data.sort((a, b) => {
                const byDate = b.date.localeCompare(a.date)
                if (byDate !== 0) return byDate
                return b.time.localeCompare(a.time)
            })
            setConsultations(data)
        })

        return () => unsubscribe()
    }, [teacherId])

    // Calendar Logic
    const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) })
    const startDay = startOfMonth(currentMonth).getDay()
    const emptyDays = Array(startDay).fill(null)
    const consultationDates = new Set(consultations.map(c => c.date))

    const handleDateClick = (day: Date) => {
        setSelectedDate(day)
        setViewMode("list")
        setActiveTab("calendar")
        setFormData({ ...formData, time: format(new Date(), "HH:mm"), studentId: "", studentName: "", topic: "", content: "" })
        setSummary("")
        setIsSearchOpen(false)
    }

    const handleTodayClick = () => {
        const today = new Date()
        setCurrentMonth(today)
        setSelectedDate(today)
        setViewMode("list")
        setActiveTab("calendar")
    }

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const q = e.target.value
        setSearchQuery(q)
        if (q.trim()) {
            setViewMode("search")
            setActiveTab("calendar")
        } else {
            setViewMode("list")
        }
    }

    const toggleSearch = () => {
        setIsSearchOpen(!isSearchOpen)
        if (isSearchOpen) {
            setSearchQuery("")
            setViewMode("list")
        }
    }

    const handleSummarize = async () => {
        if (!formData.content) return
        setIsSummarizing(true)
        try {
            const systemMessage = `
당신은 학교 교사의 학생 상담 기록을 정리하는 전문가입니다.
다음 상담 내용을 포멀하고 공식적인 문체로 정돈하여 작성해주세요.

[중요 규칙]
• 마크다운 기호(##, **, -, * 등)를 절대 사용하지 마세요
• "상담교사"라는 단어를 절대 사용하지 마세요 (일반 교사의 상담임)
• 원본에 없는 내용을 절대 만들어 내지 마세요
• 작성된 내용을 그대로 포멀한 문체로 다듬기만 하세요

[작성 형식]
• 제목은 【】로 표시
• 불릿은 • 사용
• 중요 키워드는 「」로 강조

[작성 내용 - 아래 두 섹션만 작성]
【상담 개요】
→ 상담 주제를 한 줄로 정리

【상담 내용】
→ 원본 내용을 포멀한 문체로 정돈하여 작성
→ 새로운 내용 추가 금지, 원본 내용만 다듬어서 작성
`.trim()

            const prompt = `날짜: ${format(selectedDate, "yyyy-MM-dd")} ${formData.time}
학생: ${formData.studentName} (${formData.studentId})
주제: ${formData.topic}
내용: ${formData.content}

위 형식대로 간결하게 정리해주세요:`

            const rawResult = await generateWithRetry({
                systemMessage,
                prompt,
                model: selectedModel,
            })

            const processed = cleanMetaInfo(rawResult)
            if (processed) setSummary(processed)
        } catch (error: unknown) {
            console.error("Summarize Error:", error)
            const message = error instanceof Error ? error.message : "알 수 없는 오류"
            alert(`요약 실패: ${message}`)
        } finally {
            setIsSummarizing(false)
        }
    }

    const handleSave = async (withSummary: boolean) => {
        if (!teacherId) return alert("로그인 정보를 찾을 수 없습니다. 다시 로그인해주세요.")
        if (!formData.studentName || !formData.content) return alert("필수 정보를 입력해주세요.")
        setIsSaving(true)
        try {
            await addDoc(collection(db, "consultations"), {
                teacherId,
                teacherEmail,
                date: format(selectedDate, "yyyy-MM-dd"),
                time: formData.time,
                studentId: formData.studentId,
                studentName: formData.studentName,
                topic: formData.topic,
                originalContent: formData.content,
                aiSummary: withSummary ? summary : null,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            })
            setViewMode("list")
            setFormData({ ...formData, studentId: "", studentName: "", topic: "", content: "" })
            setSummary("")
        } catch {
            alert("저장 실패")
        } finally {
            setIsSaving(false)
        }
    }

    const handleLogout = async () => {
        if (!confirm("로그아웃 하시겠습니까?")) return
        try {
            await signOut(auth)
        } catch {
            alert("로그아웃 중 오류가 발생했습니다.")
        }
    }

    const handleDeleteAccount = async () => {
        setIsDeleting(true)
        try {
            const user = auth.currentUser
            if (!user) throw new Error("인증된 사용자가 없습니다.")

            // 백업을 위해 프로필 정보 가져오기
            const profileRef = doc(db, "users", user.uid)
            const profileSnapshot = await getDoc(profileRef)
            const profileData = profileSnapshot.exists() ? profileSnapshot.data() : null

            // 1. Firestore 상담 데이터 삭제
            const consultationsQuery = query(
                collection(db, "consultations"),
                where("teacherId", "==", user.uid)
            )
            const consultationsSnapshot = await getDocs(consultationsQuery)
            const deletePromises = consultationsSnapshot.docs.map(d => deleteDoc(d.ref))
            await Promise.all(deletePromises)

            // 2. Firestore 사용자 프로필 삭제
            await deleteDoc(profileRef)

            // 3. Firebase Auth 계정 삭제
            try {
                await deleteUser(user)
            } catch (authError: any) {
                // Auth 계정 삭제 실패 시 프로필 복원 (롤백)
                if (profileData) {
                    await setDoc(profileRef, profileData)
                }
                throw authError
            }

            setDeleteStep("done")
        } catch (err: unknown) {
            const code = typeof err === "object" && err && "code" in err ? String(err.code) : ""
            if (code === "auth/requires-recent-login") {
                alert("보안을 위해 로그아웃 후 다시 로그인한 다음 탈퇴를 진행해주세요.")
            } else {
                alert("회원 탈퇴 중 오류가 발생했습니다. 다시 시도해주세요.")
            }
            console.error("Delete account error:", err)
            setDeleteStep("idle")
        } finally {
            setIsDeleting(false)
        }
    }

    const confirmDeleteTwice = (
        firstMessage: string,
        secondMessage = "정말로 삭제하시겠습니까?\n삭제한 데이터는 복구할 수 없습니다."
    ) => {
        if (!confirm(firstMessage)) return false
        return confirm(secondMessage)
    }

    const deleteConsultationsByIds = async (ids: string[], firstMessage: string) => {
        if (ids.length === 0) {
            alert("삭제할 상담 기록이 없습니다.")
            return false
        }
        if (!confirmDeleteTwice(firstMessage)) return false

        try {
            await Promise.all(ids.map(id => deleteDoc(doc(db, "consultations", id))))
            return true
        } catch {
            alert("삭제 중 오류가 발생했습니다.")
            return false
        }
    }

    const handleDelete = async (id: string) => {
        await deleteConsultationsByIds([id], "선택한 상담 기록을 삭제하시겠습니까?")
    }

    const resetConsultationEditState = () => {
        setEditingConsultationId(null)
        setEditFormData(EMPTY_EDIT_FORM)
        setIsUpdatingConsultation(false)
    }

    const startConsultationEdit = (consultation: Consultation) => {
        if (!consultation.id) {
            alert("수정할 상담 정보를 찾을 수 없습니다.")
            return
        }

        setEditingConsultationId(consultation.id)
        setEditFormData({
            time: consultation.time || format(new Date(), "HH:mm"),
            studentId: consultation.studentId || "",
            studentName: consultation.studentName || "",
            topic: consultation.topic || "",
            content: consultation.originalContent || "",
        })
    }

    const cancelConsultationEdit = () => {
        if (isUpdatingConsultation) return
        resetConsultationEditState()
    }

    const handleUpdateConsultation = async (consultation: Consultation) => {
        if (!consultation.id) {
            alert("수정할 상담 정보를 찾을 수 없습니다.")
            return
        }

        const nextStudentName = editFormData.studentName.trim()
        const nextContent = editFormData.content.trim()
        if (!nextStudentName || !nextContent) {
            alert("학생 이름과 상담 내용은 필수 입력 항목입니다.")
            return
        }

        const nextTopic = editFormData.topic.trim()
        const previousContent = (consultation.originalContent || "").trim()
        const previousTopic = (consultation.topic || "").trim()
        const shouldResetSummary = previousContent !== nextContent || previousTopic !== nextTopic

        setIsUpdatingConsultation(true)
        try {
            await updateDoc(doc(db, "consultations", consultation.id), {
                time: editFormData.time || consultation.time,
                studentId: editFormData.studentId.trim(),
                studentName: nextStudentName,
                topic: nextTopic,
                originalContent: nextContent,
                ...(shouldResetSummary ? { aiSummary: null } : {}),
                updatedAt: Timestamp.now(),
            })
            resetConsultationEditState()
            alert("상담 내용을 수정했습니다.")
        } catch (error) {
            console.error("Consultation update error:", error)
            setIsUpdatingConsultation(false)
            alert("상담 수정 중 오류가 발생했습니다.")
        }
    }

    const handleDeleteStudent = async (student: StudentGroup) => {
        const ids = student.consultations
            .map(c => c.id)
            .filter((id): id is string => Boolean(id))
        const deleted = await deleteConsultationsByIds(
            ids,
            `'${student.name}' 학생의 상담 기록 ${ids.length}건을 삭제하시겠습니까?`
        )
        if (deleted) {
            setExpandedStudentId(null)
            setSelectedStudentKeys(prev => prev.filter(key => key !== student.key))
        }
    }

    const handleDeleteSelectedStudents = async (students: StudentGroup[]) => {
        if (students.length === 0) {
            alert("선택된 학생이 없습니다.")
            return
        }

        const ids = students
            .flatMap(student => student.consultations.map(c => c.id))
            .filter((id): id is string => Boolean(id))

        const deleted = await deleteConsultationsByIds(
            ids,
            `선택한 학생 ${students.length}명의 상담 기록 ${ids.length}건을 삭제하시겠습니까?`
        )
        if (deleted) {
            setExpandedStudentId(null)
            setSelectedStudentKeys([])
        }
    }

    const handleDeleteAllConsultations = async () => {
        const ids = consultations.map(c => c.id).filter((id): id is string => Boolean(id))
        const deleted = await deleteConsultationsByIds(
            ids,
            `전체 상담 기록 ${ids.length}건을 모두 삭제하시겠습니까?`
        )
        if (deleted) {
            setExpandedStudentId(null)
            setSelectedStudentKeys([])
        }
    }

    const toggleStudentSelection = (studentKey: string, consultations: Consultation[]) => {
        setSelectedStudentKeys(prev => {
            const isCurrentlyChecked = prev.includes(studentKey);

            // 행발 선택 상태도 함께 동기화
            if (isCurrentlyChecked) {
                setSelectedBehaviorConsultationMap(p => {
                    const next = { ...p };
                    delete next[studentKey];
                    return next;
                });
                return prev.filter(key => key !== studentKey);
            } else {
                const allIds = consultations.map(c => c.id).filter((id): id is string => Boolean(id));
                setSelectedBehaviorConsultationMap(p => ({
                    ...p,
                    [studentKey]: allIds
                }));
                return [...prev, studentKey];
            }
        });
    }

    const toggleBehaviorConsultationSelection = (studentKey: string, consultationId: string) => {
        setSelectedBehaviorConsultationMap(prev => {
            const current = prev[studentKey] ?? []
            const nextIds = current.includes(consultationId)
                ? current.filter(id => id !== consultationId)
                : [...current, consultationId]

            if (nextIds.length === 0) {
                const next = { ...prev }
                delete next[studentKey]
                return next
            }

            return {
                ...prev,
                [studentKey]: nextIds,
            }
        })
    }

    const generateBehaviorDraftWithValidation = async ({
        prompt,
        model,
    }: {
        prompt: string;
        model: string;
    }): Promise<string> => {
        let currentPrompt = prompt
        let lastViolations: string[] = []

        for (let attempt = 0; attempt <= MAX_BEHAVIOR_REWRITE_ATTEMPTS; attempt++) {
            const raw = await generateWithRetry({
                systemMessage: STUDENT_BEHAVIOR_SYSTEM_MESSAGE,
                prompt: currentPrompt,
                model,
            })
            const cleaned = normalizeBehaviorDraftText(cleanMetaInfo(raw))
            const validation = validateBehaviorDraft(cleaned)

            if (validation.isValid) {
                return cleaned
            }

            lastViolations = validation.violations

            if (attempt === MAX_BEHAVIOR_REWRITE_ATTEMPTS) {
                break
            }

            currentPrompt = buildBehaviorRewritePrompt({
                basePrompt: prompt,
                previousDraft: cleaned,
                violations: validation.violations,
            })
        }

        throw new Error(buildBehaviorRuleErrorMessage(lastViolations))
    }

    const generateBehaviorDraftsForStudents = async (targets: StudentGroup[]) => {
        if (targets.length === 0) {
            alert("행동발달 초안을 생성할 학생이 없습니다.")
            return
        }

        if (behaviorEvidenceMode === "selected_only") {
            const missingStudents = targets.filter(group => {
                const selectedIds = new Set(selectedBehaviorConsultationMap[group.key] ?? [])
                return !group.consultations.some(item => item.id && selectedIds.has(item.id))
            })

            if (missingStudents.length > 0) {
                const preview = missingStudents.slice(0, 5).map(group => group.name).join(", ")
                const suffix = missingStudents.length > 5 ? ` 외 ${missingStudents.length - 5}명` : ""
                alert(`체크한 상담만 반영 모드에서는 학생별로 최소 1건 이상 체크가 필요합니다.\n미선택 학생: ${preview}${suffix}`)
                return
            }
        }

        const targetKeys = new Set(targets.map(target => target.key))
        setBehaviorProgress({ total: targets.length, completed: 0, failed: 0 })
        setIsGeneratingBehavior(true)

        setBehaviorDrafts(prev => {
            const keep = prev.filter(draft => !targetKeys.has(draft.studentKey))
            const ready = targets.map(group => {
                const existing = prev.find(draft => draft.studentKey === group.key)
                return {
                    ...createBehaviorDraftFromGroup(group),
                    content: existing?.content ?? "",
                    status: "pending" as BehaviorDraftStatus,
                    errorMessage: undefined,
                    generatedAt: existing?.generatedAt,
                    modelId: existing?.modelId,
                }
            })
            return [...ready, ...keep]
        })

        let completedCount = 0
        let failedCount = 0

        for (const group of targets) {
            setBehaviorDrafts(prev => upsertBehaviorDraft(prev, {
                ...createBehaviorDraftFromGroup(group),
                content: prev.find(item => item.studentKey === group.key)?.content ?? "",
                status: "generating",
                errorMessage: undefined,
                modelId: selectedModel,
            }))

            try {
                const selectedIds = new Set(selectedBehaviorConsultationMap[group.key] ?? [])
                const consultationsForPrompt = behaviorEvidenceMode === "selected_only"
                    ? group.consultations.filter(item => item.id && selectedIds.has(item.id))
                    : group.consultations

                const prompt = buildStudentBehaviorPrompt({
                    studentName: group.name,
                    studentId: group.id,
                    consultations: consultationsForPrompt,
                    evidenceMode: behaviorEvidenceMode,
                    totalConsultationCount: group.consultations.length,
                })
                const cleaned = await generateBehaviorDraftWithValidation({
                    prompt,
                    model: selectedModel,
                })

                setBehaviorDrafts(prev => upsertBehaviorDraft(prev, {
                    ...createBehaviorDraftFromGroup(group),
                    content: cleaned,
                    status: "completed",
                    errorMessage: undefined,
                    modelId: selectedModel,
                    generatedAt: new Date().toISOString(),
                }))
            } catch (error: unknown) {
                failedCount += 1
                const message = error instanceof Error ? error.message : "알 수 없는 오류"

                setBehaviorDrafts(prev => upsertBehaviorDraft(prev, {
                    ...createBehaviorDraftFromGroup(group),
                    content: prev.find(item => item.studentKey === group.key)?.content ?? "",
                    status: "failed",
                    errorMessage: message,
                    modelId: selectedModel,
                }))
            } finally {
                completedCount += 1
                setBehaviorProgress({
                    total: targets.length,
                    completed: completedCount,
                    failed: failedCount,
                })
            }
        }

        setIsGeneratingBehavior(false)

        const successCount = targets.length - failedCount
        alert(`행동발달 초안 생성을 완료했습니다. (성공 ${successCount} / 실패 ${failedCount})`)
    }

    const handleGenerateBehaviorDrafts = async () => {
        if (isGeneratingBehavior) return
        const targets = behaviorGenerationMode === "all" ? studentGroups : selectedStudentGroups
        const targetLabel = behaviorGenerationMode === "all" ? "전체 학생" : "선택 학생"

        if (!confirm(`${targetLabel} ${targets.length}명의 행동발달 초안을 생성하시겠습니까?`)) return
        await generateBehaviorDraftsForStudents(targets)
    }

    const handleRegenerateBehaviorDraft = async (studentKey: string) => {
        if (isGeneratingBehavior) return
        const target = studentGroups.find(group => group.key === studentKey)
        if (!target) {
            alert("대상 학생 정보를 찾을 수 없습니다.")
            return
        }
        await generateBehaviorDraftsForStudents([target])
    }

    const handleBehaviorDraftContentChange = (studentKey: string, content: string) => {
        setBehaviorDrafts(prev => prev.map(draft =>
            draft.studentKey === studentKey
                ? { ...draft, content }
                : draft
        ))
    }

    const handleDownloadBehaviorExcel = async () => {
        if (isGeneratingBehavior) {
            alert("생성 중에는 다운로드할 수 없습니다.")
            return
        }
        if (behaviorDrafts.length === 0) {
            alert("내보낼 행동발달 초안이 없습니다.")
            return
        }

        setIsExportingBehavior(true)
        try {
            const XLSX = await import("xlsx")

            const rows = behaviorDrafts.map(draft => ({
                학번: draft.studentId,
                학생명: draft.studentName,
                상담건수: draft.consultationCount,
                마지막상담시각: `${draft.lastDate} ${draft.lastTime}`.trim(),
                행동발달초안: draft.content,
                상태: getBehaviorStatusLabel(draft.status),
                오류메시지: draft.errorMessage ?? "",
                모델: draft.modelId ?? "",
                생성시각: draft.generatedAt
                    ? format(new Date(draft.generatedAt), "yyyy-MM-dd HH:mm:ss")
                    : "",
            }))

            const worksheet = XLSX.utils.json_to_sheet(rows)
            worksheet["!cols"] = [
                { wch: 12 },
                { wch: 16 },
                { wch: 18 },
                { wch: 22 },
                { wch: 70 },
                { wch: 12 },
                { wch: 26 },
                { wch: 18 },
                { wch: 22 },
            ]

            const workbook = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(workbook, worksheet, "행동발달초안")
            XLSX.writeFile(workbook, `행동발달초안_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`)
        } catch (error) {
            console.error("Behavior Excel Export Error:", error)
            alert("엑셀 파일 내보내기에 실패했습니다.")
        } finally {
            setIsExportingBehavior(false)
        }
    }

    const renderConsultationEditForm = (consultation: Consultation) => {
        if (!consultation.id || editingConsultationId !== consultation.id) return null

        return (
            <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--gray-50)', borderColor: 'var(--primary-light)' }}>
                <div className="grid grid-cols-2 gap-4 mb-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-gray-700">시간</label>
                        <input
                            type="time"
                            value={editFormData.time}
                            onChange={e => setEditFormData(prev => ({ ...prev, time: e.target.value }))}
                            className="input-field"
                            style={{ paddingTop: "8px", paddingBottom: "8px" }}
                            disabled={isUpdatingConsultation}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-gray-700">주제</label>
                        <input
                            type="text"
                            value={editFormData.topic}
                            onChange={e => setEditFormData(prev => ({ ...prev, topic: e.target.value }))}
                            className="input-field"
                            placeholder="예: 진로, 교우관계"
                            style={{ paddingTop: "8px", paddingBottom: "8px" }}
                            disabled={isUpdatingConsultation}
                        />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-gray-700">학번</label>
                        <input
                            type="text"
                            value={editFormData.studentId}
                            onChange={e => setEditFormData(prev => ({ ...prev, studentId: e.target.value.replace(/\D/g, "") }))}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            className="input-field"
                            style={{ paddingTop: "8px", paddingBottom: "8px" }}
                            disabled={isUpdatingConsultation}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-gray-700">이름 <span className="text-danger">*</span></label>
                        <input
                            type="text"
                            value={editFormData.studentName}
                            onChange={e => setEditFormData(prev => ({ ...prev, studentName: e.target.value }))}
                            className="input-field"
                            style={{ paddingTop: "8px", paddingBottom: "8px" }}
                            disabled={isUpdatingConsultation}
                        />
                    </div>
                </div>
                <div className="flex flex-col gap-1 mb-3">
                    <label className="text-xs font-semibold text-gray-700">상담 내용 <span className="text-danger">*</span></label>
                    <textarea
                        value={editFormData.content}
                        onChange={e => setEditFormData(prev => ({ ...prev, content: e.target.value }))}
                        className="input-field"
                        style={{ minHeight: "110px", resize: "vertical" }}
                        disabled={isUpdatingConsultation}
                    />
                </div>
                <div className="flex justify-end gap-2">
                    <button
                        onClick={cancelConsultationEdit}
                        className="btn btn-ghost text-sm"
                        style={{ padding: "8px 12px" }}
                        disabled={isUpdatingConsultation}
                    >
                        취소
                    </button>
                    <button
                        onClick={() => { void handleUpdateConsultation(consultation) }}
                        className="btn btn-primary text-sm"
                        style={{ padding: "8px 12px" }}
                        disabled={isUpdatingConsultation}
                    >
                        {isUpdatingConsultation ? "저장 중..." : "수정 저장"}
                    </button>
                </div>
            </div>
        )
    }

    const handleUnlockAccount = async () => {
        if (!teacherId || teacherRole !== "admin") return

        const normalized = normalizeEmail(unlockEmail)
        if (!normalized) {
            alert("잠금 해제할 계정 이메일을 입력해주세요.")
            return
        }

        setIsUnlocking(true)
        try {
            const lockKey = await buildEmailLockKey(normalized)
            await setDoc(
                doc(db, "loginLocks", lockKey),
                {
                    failedAttempts: 0,
                    isLocked: false,
                    updatedAt: serverTimestamp(),
                    unlockedAt: serverTimestamp(),
                    unlockedBy: teacherId,
                },
                { merge: true }
            )
            setUnlockEmail("")
            alert("계정 잠금이 해제되었습니다.")
        } catch {
            alert("잠금 해제 중 오류가 발생했습니다.")
        } finally {
            setIsUnlocking(false)
        }
    }

    const selectedDateStr = format(selectedDate, "yyyy-MM-dd")
    const selectedList = consultations.filter(c => c.date === selectedDateStr)
    const searchResults = consultations.filter(c =>
        c.studentName.includes(searchQuery) ||
        c.originalContent?.includes(searchQuery) ||
        c.topic?.includes(searchQuery)
    )

    const displayList = viewMode === "search" ? searchResults : selectedList
    const holidayName = HOLIDAYS[format(selectedDate, "MM-dd")] || HOLIDAYS[selectedDateStr]

    // Stats Data
    const totalConsultations = consultations.length
    const aiSummaryCount = consultations.filter(c => c.aiSummary).length
    const studentCount = new Set(consultations.map(c => c.studentName)).size

    // Students List Data (학생명 + 학번 기준 그룹화, 최신 상담 우선 정렬)
    const studentGroupsMap = consultations.reduce((acc, consultation) => {
        const studentName = consultation.studentName?.trim() || "(이름 없음)"
        const studentId = consultation.studentId?.trim() || "-"
        const key = `${studentName}__${studentId}`

        if (!acc[key]) {
            acc[key] = {
                key,
                name: studentName,
                id: studentId,
                count: 0,
                lastDate: "",
                lastTime: "",
                consultations: [],
            }
        }
        acc[key].consultations.push(consultation)
        return acc
    }, {} as Record<string, StudentGroup>)

    const studentGroups = Object.values(studentGroupsMap)
        .map((group) => {
            const sortedConsultations = [...group.consultations].sort(compareConsultationByDateDesc)
            const latest = sortedConsultations[0]
            return {
                ...group,
                consultations: sortedConsultations,
                count: sortedConsultations.length,
                lastDate: latest?.date ?? "",
                lastTime: latest?.time ?? "",
            }
        })
        .sort((a, b) => {
            if (studentSortOption === "student_id_asc") {
                return compareStudentId(a.id, b.id)
            }
            if (studentSortOption === "student_id_desc") {
                return compareStudentId(b.id, a.id)
            }

            const byDate = b.lastDate.localeCompare(a.lastDate)
            if (byDate !== 0) return byDate
            return b.lastTime.localeCompare(a.lastTime)
        })

    const selectedStudentGroups = studentGroups.filter(group => selectedStudentKeys.includes(group.key))
    const isAllStudentsSelected = studentGroups.length > 0 && selectedStudentKeys.length === studentGroups.length
    const behaviorTargetGroups = behaviorGenerationMode === "all" ? studentGroups : selectedStudentGroups
    const completedBehaviorCount = behaviorDrafts.filter(draft => draft.status === "completed").length
    const failedBehaviorCount = behaviorDrafts.filter(draft => draft.status === "failed").length
    const selectedBehaviorStudentCount = Object.values(selectedBehaviorConsultationMap).filter(ids => ids.length > 0).length
    const selectedBehaviorConsultationCount = Object.values(selectedBehaviorConsultationMap).reduce((total, ids) => total + ids.length, 0)
    const selectedOnlyMissingTargetCount = behaviorEvidenceMode === "selected_only"
        ? behaviorTargetGroups.filter(group => {
            const selectedIds = new Set(selectedBehaviorConsultationMap[group.key] ?? [])
            return !group.consultations.some(item => item.id && selectedIds.has(item.id))
        }).length
        : 0

    const studentOrderMap = useMemo(
        () => new Map(studentGroups.map((group, index) => [group.key, index])),
        [studentGroups]
    )

    const sortedBehaviorDrafts = useMemo(
        () => [...behaviorDrafts].sort((a, b) => {
            const aOrder = studentOrderMap.get(a.studentKey) ?? Number.MAX_SAFE_INTEGER
            const bOrder = studentOrderMap.get(b.studentKey) ?? Number.MAX_SAFE_INTEGER
            if (aOrder !== bOrder) return aOrder - bOrder
            return compareStudentId(a.studentId, b.studentId)
        }),
        [behaviorDrafts, studentOrderMap]
    )

    useEffect(() => {
        const availableKeys = new Set(
            consultations.map(c => `${(c.studentName?.trim() || "(이름 없음)")}__${(c.studentId?.trim() || "-")}`)
        )
        const availableConsultationIds = new Set(
            consultations
                .map(c => c.id)
                .filter((id): id is string => Boolean(id))
        )
        const consultationIdsByStudent = consultations.reduce((acc, consultation) => {
            if (!consultation.id) return acc
            const key = `${(consultation.studentName?.trim() || "(이름 없음)")}__${(consultation.studentId?.trim() || "-")}`
            if (!acc[key]) {
                acc[key] = new Set<string>()
            }
            acc[key].add(consultation.id)
            return acc
        }, {} as Record<string, Set<string>>)

        setSelectedStudentKeys(prev => {
            const next = prev.filter(key => availableKeys.has(key))
            const unchanged = next.length === prev.length && next.every((key, index) => key === prev[index])
            return unchanged ? prev : next
        })

        setSelectedBehaviorConsultationMap(prev => {
            const next: Record<string, string[]> = {}

            for (const [studentKey, ids] of Object.entries(prev)) {
                const availableIds = consultationIdsByStudent[studentKey]
                if (!availableIds) continue
                const filteredIds = ids.filter(id => availableIds.has(id))
                if (filteredIds.length > 0) {
                    next[studentKey] = filteredIds
                }
            }

            const prevEntries = Object.entries(prev)
            const nextEntries = Object.entries(next)
            const isUnchanged = prevEntries.length === nextEntries.length
                && prevEntries.every(([key, ids]) => {
                    const nextIds = next[key]
                    return Boolean(nextIds)
                        && ids.length === nextIds.length
                        && ids.every((id, index) => id === nextIds[index])
                })

            return isUnchanged ? prev : next
        })

        if (expandedStudentId && !availableKeys.has(expandedStudentId)) {
            setExpandedStudentId(null)
        }

        if (editingConsultationId && !availableConsultationIds.has(editingConsultationId)) {
            setEditingConsultationId(null)
            setEditFormData(EMPTY_EDIT_FORM)
            setIsUpdatingConsultation(false)
        }
    }, [consultations, expandedStudentId, editingConsultationId])

    useEffect(() => {
        const groupMap = new Map(studentGroups.map(group => [group.key, group]))

        setBehaviorDrafts(prev => {
            let changed = false
            const next = prev
                .filter(draft => groupMap.has(draft.studentKey))
                .map(draft => {
                    const group = groupMap.get(draft.studentKey)!
                    if (
                        draft.studentName === group.name &&
                        draft.studentId === group.id &&
                        draft.consultationCount === group.count &&
                        draft.lastDate === group.lastDate &&
                        draft.lastTime === group.lastTime
                    ) {
                        return draft
                    }

                    changed = true
                    return {
                        ...draft,
                        studentName: group.name,
                        studentId: group.id,
                        consultationCount: group.count,
                        lastDate: group.lastDate,
                        lastTime: group.lastTime,
                    }
                })

            if (next.length !== prev.length) changed = true
            return changed ? next : prev
        })
    }, [studentGroups])

    // Monthly Stats
    const getMonthlyStats = () => {
        const stats = []
        const today = new Date()
        for (let i = 5; i >= 0; i--) {
            const d = subMonths(today, i)
            const key = format(d, "yyyy-MM")
            const label = format(d, "M월")
            const count = consultations.filter(c => c.date.startsWith(key)).length
            stats.push({ label, count, key })
        }
        return stats
    }
    const monthlyStats = getMonthlyStats()
    const maxCount = Math.max(...monthlyStats.map(s => s.count), 1)

    return (
        <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--background)' }}>
            {/* Header */}
            <header style={{ height: 'var(--header-height)', backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 20 }}>
                <div className="container h-full flex items-center justify-between">
                    <div className="flex items-center gap-8">
                        <div
                            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => setActiveTab("calendar")}
                            style={{ cursor: 'pointer' }}
                        >
                            <div className="bg-primary rounded-lg flex items-center justify-center" style={{ width: '32px', height: '32px' }}>
                                <Sparkles className="text-white" style={{ width: '20px', height: '20px' }} />
                            </div>
                            <span className="text-xl font-bold text-gray-900">Sangdam Note</span>
                        </div>
                        <nav className="hidden md:flex items-center gap-2">
                            <button
                                onClick={() => setActiveTab("calendar")}
                                className={`btn btn-ghost font-semibold ${activeTab === "calendar" ? "bg-gray-100 text-primary" : "text-gray-500"}`}
                            >
                                상담 관리
                            </button>
                            <button
                                onClick={() => setActiveTab("students")}
                                className={`btn btn-ghost font-semibold ${activeTab === "students" ? "bg-gray-100 text-primary" : "text-gray-500"}`}
                            >
                                학생 목록
                            </button>
                            <button
                                onClick={() => setActiveTab("stats")}
                                className={`btn btn-ghost font-semibold ${activeTab === "stats" ? "bg-gray-100 text-primary" : "text-gray-500"}`}
                            >
                                통계
                            </button>
                            {teacherRole === "admin" && (
                                <button
                                    onClick={() => setActiveTab("admin")}
                                    className={`btn btn-ghost font-semibold flex items-center gap-2 ${activeTab === "admin" ? "bg-gray-100 text-primary" : "text-gray-500"}`}
                                >
                                    <ShieldCheck style={{ width: '16px', height: '16px' }} />
                                    관리자
                                </button>
                            )}
                        </nav>
                    </div>
                    <div className="flex items-center gap-2 relative">
                        <button
                            onClick={toggleSearch}
                            className={`btn btn-ghost p-2 rounded-full ${isSearchOpen ? 'bg-gray-100 text-primary' : ''}`}
                            data-tooltip-bottom="학생 검색"
                        >
                            <Search style={{ width: '20px', height: '20px' }} />
                        </button>

                        <button
                            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                            className="btn btn-ghost p-2 rounded-full"
                            data-tooltip-bottom={resolvedTheme === 'dark' ? '라이트 모드' : '다크 모드'}
                        >
                            {resolvedTheme === 'dark'
                                ? <Sun style={{ width: '20px', height: '20px' }} />
                                : <Moon style={{ width: '20px', height: '20px' }} />
                            }
                        </button>

                        {/* Profile Button */}
                        <div className="relative" ref={profileRef}>
                            <button
                                onClick={() => { setIsProfileOpen(!isProfileOpen); setDeleteStep("idle") }}
                                className={`btn btn-ghost p-2 rounded-full ${isProfileOpen ? 'bg-gray-100 text-primary' : ''}`}
                                data-tooltip-bottom="내 정보"
                            >
                                <User style={{ width: '20px', height: '20px' }} />
                            </button>

                            {/* Profile Popup */}
                            {isProfileOpen && (
                                <div className="popup-panel" style={{ width: '300px', right: 0, top: '100%', marginTop: '8px' }}>
                                    <div className="flex items-center gap-3 mb-4 pb-4 border-b">
                                        <div className="bg-primary rounded-full flex items-center justify-center" style={{ width: '40px', height: '40px', flexShrink: 0 }}>
                                            <User className="text-white" style={{ width: '20px', height: '20px' }} />
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            <div className="font-bold text-gray-900" style={{ fontSize: '15px' }}>{teacherName || "교사"}</div>
                                            {teacherRole === "admin" && (
                                                <span className="badge badge-primary text-xs" style={{ padding: '1px 6px', fontSize: '10px' }}>관리자</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-3 mb-4">
                                        <div>
                                            <div className="text-xs font-semibold text-gray-500 mb-1">아이디 (이메일)</div>
                                            <div className="text-sm text-gray-900" style={{ wordBreak: 'break-all' }}>{teacherEmail}</div>
                                        </div>
                                        {teacherCreatedAt && (
                                            <div>
                                                <div className="text-xs font-semibold text-gray-500 mb-1">가입일</div>
                                                <div className="text-sm text-gray-900">{teacherCreatedAt}</div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="border-t pt-3 flex flex-col gap-2">
                                        <button
                                            onClick={() => { void handleLogout(); setIsProfileOpen(false) }}
                                            className="btn btn-ghost text-sm font-medium flex items-center gap-2 w-full justify-start text-gray-600"
                                            style={{ padding: '8px 12px' }}
                                        >
                                            <LogOut style={{ width: '16px', height: '16px' }} /> 로그아웃
                                        </button>
                                        <button
                                            onClick={() => setDeleteStep("confirm")}
                                            className="btn btn-ghost text-sm font-medium flex items-center gap-2 w-full justify-start"
                                            style={{ padding: '8px 12px', color: 'var(--danger)' }}
                                        >
                                            <Trash2 style={{ width: '16px', height: '16px' }} /> 회원 탈퇴
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Mobile Hamburger Menu */}
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="btn btn-ghost p-2 rounded-full md:hidden-util"
                        >
                            {isMobileMenuOpen ? <X style={{ width: '20px', height: '20px' }} /> : <Menu style={{ width: '20px', height: '20px' }} />}
                        </button>
                    </div>
                </div>
            </header>

            {/* Mobile Navigation Drawer */}
            {isMobileMenuOpen && (
                <div className="md:hidden-util" style={{ backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 16px', position: 'sticky', top: 'var(--header-height)', zIndex: 19 }}>
                    <nav className="flex flex-col gap-1">
                        <button
                            onClick={() => { setActiveTab("calendar"); setIsMobileMenuOpen(false) }}
                            className={`btn btn-ghost font-semibold text-left ${activeTab === "calendar" ? "bg-gray-100 text-primary" : "text-gray-500"}`}
                            style={{ justifyContent: 'flex-start', padding: '10px 12px' }}
                        >
                            상담 관리
                        </button>
                        <button
                            onClick={() => { setActiveTab("students"); setIsMobileMenuOpen(false) }}
                            className={`btn btn-ghost font-semibold text-left ${activeTab === "students" ? "bg-gray-100 text-primary" : "text-gray-500"}`}
                            style={{ justifyContent: 'flex-start', padding: '10px 12px' }}
                        >
                            학생 목록
                        </button>
                        <button
                            onClick={() => { setActiveTab("stats"); setIsMobileMenuOpen(false) }}
                            className={`btn btn-ghost font-semibold text-left ${activeTab === "stats" ? "bg-gray-100 text-primary" : "text-gray-500"}`}
                            style={{ justifyContent: 'flex-start', padding: '10px 12px' }}
                        >
                            통계
                        </button>
                        {teacherRole === "admin" && (
                            <button
                                onClick={() => { setActiveTab("admin"); setIsMobileMenuOpen(false) }}
                                className={`btn btn-ghost font-semibold text-left flex items-center gap-2 ${activeTab === "admin" ? "bg-gray-100 text-primary" : "text-gray-500"}`}
                                style={{ justifyContent: 'flex-start', padding: '10px 12px' }}
                            >
                                <ShieldCheck style={{ width: '16px', height: '16px' }} /> 관리자
                            </button>
                        )}
                    </nav>
                </div>
            )}

            {/* Delete Account Confirmation Modal */}
            {deleteStep === "confirm" && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
                    <div className="card p-8" style={{ maxWidth: '400px', width: '100%', backgroundColor: 'var(--surface)', textAlign: 'center' }}>
                        <div className="flex items-center justify-center mb-4">
                            <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'var(--danger-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <AlertTriangle style={{ width: '28px', height: '28px', color: 'var(--danger)' }} />
                            </div>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">정말 탈퇴하시겠습니까?</h3>
                        <p className="text-sm text-gray-500 mb-6">
                            탈퇴하면 모든 상담 기록과 계정 정보가 영구적으로 삭제되며, 복구할 수 없습니다.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setDeleteStep("idle"); setIsProfileOpen(false) }}
                                className="btn btn-ghost flex-1"
                                style={{ padding: '10px', border: '1px solid var(--border)' }}
                                disabled={isDeleting}
                            >
                                취소
                            </button>
                            <button
                                onClick={() => { void handleDeleteAccount() }}
                                className="btn flex-1"
                                style={{ padding: '10px', backgroundColor: 'var(--danger)', color: 'white', border: 'none' }}
                                disabled={isDeleting}
                            >
                                {isDeleting ? "탈퇴 처리 중..." : "탈퇴하기"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Account Success Modal */}
            {deleteStep === "done" && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
                    <div className="card p-8" style={{ maxWidth: '400px', width: '100%', backgroundColor: 'var(--surface)', textAlign: 'center' }}>
                        <div className="flex items-center justify-center mb-4">
                            <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Sparkles style={{ width: '28px', height: '28px', color: 'var(--primary)' }} />
                            </div>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">탈퇴가 완료되었습니다</h3>
                        <p className="text-sm text-gray-500 mb-6">
                            그동안 이용해 주셔서 감사합니다.<br />
                            모든 데이터가 안전하게 삭제되었습니다.
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            className="btn btn-primary w-full"
                            style={{ padding: '10px' }}
                        >
                            확인
                        </button>
                    </div>
                </div>
            )}


            {/* Main Content */}
            <main className="flex-1 w-full container py-6">

                {/* Search Bar */}
                <div className={`search-bar-container px-6 ${isSearchOpen ? 'open' : ''}`} style={{ borderBottom: isSearchOpen ? '1px solid var(--border)' : 'none' }}>
                    <div className="relative pt-4 pb-4">
                        <Search className="text-gray-500 absolute" style={{ width: '20px', height: '20px', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            type="text"
                            placeholder="학생 이름이나 상담 내용을 검색하세요..."
                            value={searchQuery}
                            onChange={handleSearch}
                            className="input-field"
                            style={{ paddingLeft: '40px' }}
                            autoFocus={isSearchOpen}
                        />
                    </div>
                </div>

                {activeTab === "calendar" && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        {/* Left Column: Calendar */}
                        <div className="lg:col-span-4 flex flex-col gap-6">
                            <div className="card p-6" style={{ backgroundColor: 'var(--surface)' }}>
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-xl font-bold text-gray-900" style={{ whiteSpace: 'nowrap' }}>{format(currentMonth, "yyyy MMM", { locale: ko })}</h2>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={handleTodayClick}
                                            className="text-white bg-primary shadow-md rounded-full text-xs font-bold transition-all flex items-center justify-center"
                                            style={{ padding: '6px 14px', whiteSpace: 'nowrap' }}
                                        >
                                            오늘
                                        </button>
                                        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="btn btn-ghost p-2"><ChevronLeft style={{ width: '20px', height: '20px' }} /></button>
                                        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="btn btn-ghost p-2"><ChevronRight style={{ width: '20px', height: '20px' }} /></button>
                                    </div>
                                </div>

                                <div className="calendar-grid mb-2">
                                    {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
                                        <div key={d} className={`text-center text-xs font-semibold py-2 ${i === 0 ? 'text-red' : i === 6 ? 'text-blue' : 'text-gray-500'}`}>{d}</div>
                                    ))}
                                </div>

                                <div className="calendar-grid">
                                    {emptyDays.map((_, i) => <div key={`e-${i}`} />)}
                                    {days.map(day => {
                                        const isSelected = isSameDay(day, selectedDate)
                                        const isTodayDate = isToday(day)
                                        const hasDot = consultationDates.has(format(day, "yyyy-MM-dd"))
                                        const dayOfWeek = getDay(day)
                                        const isHoliday = !!(HOLIDAYS[format(day, "MM-dd")] || HOLIDAYS[format(day, "yyyy-MM-dd")])

                                        let dayClass = "calendar-day"
                                        if (isSelected) dayClass += " selected"
                                        else if (isTodayDate) dayClass += " today"

                                        if (!isSelected && !isTodayDate) {
                                            if (dayOfWeek === 0 || isHoliday) dayClass += " text-red"
                                            else if (dayOfWeek === 6) dayClass += " text-blue"
                                        }

                                        if (hasDot) dayClass += " has-event"

                                        return (
                                            <button
                                                key={day.toISOString()}
                                                onClick={() => handleDateClick(day)}
                                                className={dayClass}
                                            >
                                                {format(day, "d")}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Mini Stats */}
                            <div className="card p-6 text-white" style={{ backgroundColor: 'var(--mini-stats-bg)', position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '128px', height: '128px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '50%', filter: 'blur(40px)' }}></div>
                                <h3 className="text-lg font-bold mb-4" style={{ position: 'relative', zIndex: 1 }}>이번 달 통계</h3>
                                <div className="grid grid-cols-2 gap-4" style={{ position: 'relative', zIndex: 1 }}>
                                    <div>
                                        <div className="text-xs font-medium mb-1" style={{ color: 'var(--mini-stats-accent)' }}>총 상담 건수</div>
                                        <div className="text-2xl font-bold">{consultations.filter(c => c.date.startsWith(format(currentMonth, "yyyy-MM"))).length}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-medium mb-1" style={{ color: 'var(--mini-stats-accent)' }}>AI 요약 건수</div>
                                        <div className="text-2xl font-bold">{consultations.filter(c => c.date.startsWith(format(currentMonth, "yyyy-MM")) && c.aiSummary).length}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Workspace */}
                        <div className="lg:col-span-8">
                            <div className="card flex flex-col" style={{ minHeight: '600px', backgroundColor: 'var(--surface)' }}>
                                {/* Workspace Header */}
                                <div className="p-6 border-b flex flex-col md:flex-row items-center justify-between gap-4">
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            {viewMode === "search" ? (
                                                <h2 className="text-2xl font-bold text-gray-900">검색 결과</h2>
                                            ) : (
                                                <>
                                                    <h2 className="text-2xl font-bold text-gray-900">{format(selectedDate, "M월 d일 EEEE", { locale: ko })}</h2>
                                                    {holidayName && <span className="badge badge-danger">{holidayName}</span>}
                                                    {isToday(selectedDate) && <span className="badge badge-primary">오늘</span>}
                                                </>
                                            )}
                                        </div>
                                        <p className="text-gray-500 text-sm">
                                            {viewMode === "search"
                                                ? `"${searchQuery}" 검색 결과 ${displayList.length}건`
                                                : "선택한 날짜의 상담 기록을 확인하거나 새 상담을 작성할 수 있습니다."}
                                        </p>
                                    </div>

                                    <div className="flex p-1 rounded-xl border" style={{ backgroundColor: 'var(--gray-50)' }}>
                                        <button
                                            onClick={() => setViewMode("list")}
                                            className={`btn btn-ghost text-sm font-semibold ${viewMode === "list" || viewMode === "search" ? "shadow-sm" : "text-gray-500"}`}
                                            style={{ padding: '8px 16px', borderRadius: '8px', ...(viewMode === "list" || viewMode === "search" ? { backgroundColor: 'var(--surface)', color: 'var(--text-main)' } : {}) }}
                                        >
                                            목록<span className="badge badge-primary" style={{ marginLeft: '6px', fontSize: '10px', padding: '2px 6px' }}>{displayList.length}</span>
                                        </button>
                                        <button
                                            onClick={() => setViewMode("write")}
                                            className={`btn btn-ghost text-sm font-semibold ${viewMode === "write" ? "shadow-sm" : "text-gray-500"}`}
                                            style={{ padding: '8px 16px', borderRadius: '8px', ...(viewMode === "write" ? { backgroundColor: 'var(--surface)', color: 'var(--text-main)' } : {}) }}
                                        >
                                            + 새 상담
                                        </button>
                                    </div>
                                </div>

                                {/* Workspace Content */}
                                <div className="p-6 flex-1" style={{ backgroundColor: 'var(--gray-50)' }}>
                                    {(viewMode === "list" || viewMode === "search") ? (
                                        displayList.length === 0 ? (
                                            <div className="h-full flex flex-col items-center justify-center text-center py-20">
                                                <div className="rounded-2xl flex items-center justify-center mb-6 border" style={{ width: '80px', height: '80px', backgroundColor: 'var(--surface)' }}>
                                                    {viewMode === "search" ? <Search className="text-gray-300" style={{ width: '40px', height: '40px' }} /> : <FileText className="text-gray-300" style={{ width: '40px', height: '40px' }} />}
                                                </div>
                                                <h3 className="text-lg font-bold text-gray-900 mb-2">
                                                    {viewMode === "search" ? "검색 결과가 없습니다" : "상담 기록이 없습니다"}
                                                </h3>
                                                <p className="text-gray-500 mb-8">
                                                    {viewMode === "search" ? (
                                                        "다른 검색어로 다시 시도해보세요."
                                                    ) : (
                                                        <>
                                                            선택한 날짜의 상담 기록이 없습니다.<br />
                                                            새 상담을 등록해 시작하세요.
                                                        </>
                                                    )}
                                                </p>
                                                {viewMode !== "search" && (
                                                    <button onClick={() => setViewMode("write")} className="btn btn-primary">
                                                        상담 작성하기
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-4">
                                                {displayList.map(c => (
                                                    <div key={c.id} className="card p-6 hover:shadow-md transition-all" style={{ backgroundColor: 'var(--surface)' }}>
                                                        <div className="flex justify-between items-start mb-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className="bg-primary-light text-primary rounded-xl flex items-center justify-center font-bold text-sm" style={{ width: '40px', height: '40px' }}>
                                                                    {c.studentId.slice(-2)}
                                                                </div>
                                                                <div>
                                                                    <h4 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                                                                        {c.studentName}
                                                                        <span className="text-sm font-normal text-gray-500">{c.studentId}</span>
                                                                        {viewMode === "search" && (
                                                                            <span className="text-xs bg-gray-100 text-gray-500 rounded-full" style={{ padding: '2px 8px' }}>
                                                                                {c.date}
                                                                            </span>
                                                                        )}
                                                                    </h4>
                                                                    <div className="flex items-center gap-2 text-sm text-gray-500">
                                                                        <Clock style={{ width: '14px', height: '14px' }} /> {c.time}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={() => {
                                                                        if (editingConsultationId === c.id) {
                                                                            cancelConsultationEdit()
                                                                            return
                                                                        }
                                                                        startConsultationEdit(c)
                                                                    }}
                                                                    className={`btn p-2 rounded-lg ${editingConsultationId === c.id ? "btn-primary text-white" : "btn-ghost text-gray-500"}`}
                                                                    data-tooltip={editingConsultationId === c.id ? "수정 취소" : "수정"}
                                                                >
                                                                    <PencilLine style={{ width: '16px', height: '16px' }} />
                                                                </button>
                                                                <button onClick={() => handleDelete(c.id!)} className="btn btn-danger-ghost p-2 rounded-lg" data-tooltip="삭제">
                                                                    <Trash2 style={{ width: '16px', height: '16px' }} />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <div style={{ paddingLeft: '52px' }}>
                                                            {editingConsultationId === c.id ? (
                                                                renderConsultationEditForm(c)
                                                            ) : (
                                                                <>
                                                                    <div className="badge badge-primary mb-3" style={{ backgroundColor: 'var(--gray-100)', color: 'var(--gray-600)' }}>
                                                                        {c.topic || "일반"}
                                                                    </div>
                                                                    <p className="text-gray-900 leading-relaxed whitespace-pre-wrap mb-4">{c.originalContent}</p>

                                                                    {c.aiSummary && (
                                                                        <div className="rounded-xl p-5" style={{ borderColor: 'var(--ai-summary-border)', backgroundColor: 'var(--ai-summary-bg)', border: '1px solid var(--ai-summary-border)' }}>
                                                                            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-yellow-200">
                                                                                <Sparkles style={{ width: '16px', height: '16px', color: 'var(--ai-summary-text)' }} />
                                                                                <span className="text-sm font-bold" style={{ color: 'var(--ai-summary-text)' }}>AI 요약</span>
                                                                            </div>
                                                                            <MarkdownRenderer content={c.aiSummary} />
                                                                        </div>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    ) : (
                                        <div className="card p-8" style={{ backgroundColor: 'var(--surface)' }}>
                                            <div className="grid grid-cols-2 gap-6 mb-6">
                                                <div className="flex flex-col gap-2">
                                                    <label className="text-sm font-bold text-gray-900">시간</label>
                                                    <input type="time" value={formData.time} onChange={e => setFormData({ ...formData, time: e.target.value })} className="input-field" />
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    <label className="text-sm font-bold text-gray-900">주제</label>
                                                    <input type="text" placeholder="예: 진로, 교우관계" value={formData.topic} onChange={e => setFormData({ ...formData, topic: e.target.value })} className="input-field" />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-6 mb-6">
                                                <div className="flex flex-col gap-2">
                                                    <label className="text-sm font-bold text-gray-900">학번</label>
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        pattern="[0-9]*"
                                                        placeholder="1234"
                                                        value={formData.studentId}
                                                        onChange={e => setFormData({ ...formData, studentId: e.target.value.replace(/\D/g, "") })}
                                                        className="input-field"
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    <label className="text-sm font-bold text-gray-900">이름 <span className="text-danger">*</span></label>
                                                    <input type="text" placeholder="학생 이름" value={formData.studentName} onChange={e => setFormData({ ...formData, studentName: e.target.value })} className="input-field" />
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-2 mb-8">
                                                <label className="text-sm font-bold text-gray-900">상담 내용 <span className="text-danger">*</span></label>
                                                <textarea
                                                    placeholder="상담 내용을 자세히 작성하세요..."
                                                    value={formData.content}
                                                    onChange={e => setFormData({ ...formData, content: e.target.value })}
                                                    className="input-field"
                                                    style={{ height: '160px', resize: 'none' }}
                                                />
                                            </div>

                                            <div className="flex flex-col gap-2 mb-8">
                                                <label className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                                    <Sparkles style={{ width: '14px', height: '14px' }} className="text-primary" /> AI 모델
                                                </label>
                                                <select
                                                    value={selectedModel}
                                                    onChange={e => setSelectedModel(e.target.value)}
                                                    className="input-field"
                                                    style={{ cursor: 'pointer' }}
                                                >
                                                    {AVAILABLE_MODELS.map(m => (
                                                        <option key={m.id} value={m.id}>
                                                            {m.name} - {m.description}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            {summary && (
                                                <div className="flex flex-col gap-2 mb-8 animate-fade-in">
                                                    <label className="text-sm font-bold text-secondary flex items-center gap-2">
                                                        <Sparkles style={{ width: '16px', height: '16px' }} /> AI 요약 결과
                                                    </label>
                                                    <textarea
                                                        value={summary}
                                                        onChange={e => setSummary(e.target.value)}
                                                        className="input-field"
                                                        style={{ height: '128px', resize: 'none', backgroundColor: 'var(--ai-summary-bg)', borderColor: 'var(--ai-summary-border)' }}
                                                    />
                                                </div>
                                            )}

                                            <div className="flex gap-4">
                                                <button
                                                    onClick={handleSummarize}
                                                    disabled={isSummarizing || !formData.content}
                                                    className="btn btn-secondary flex-1 gap-2"
                                                    style={{ color: 'var(--ai-summary-text)', borderColor: 'var(--ai-summary-border)', backgroundColor: 'var(--ai-summary-bg)' }}
                                                >
                                                    {isSummarizing ? "요약 중..." : <><Sparkles style={{ width: '20px', height: '20px' }} /> AI 요약하기</>}
                                                </button>
                                                <button
                                                    onClick={() => handleSave(!!summary)}
                                                    disabled={isSaving}
                                                    className="btn btn-primary flex-2"
                                                    style={{ flex: 2 }}
                                                >
                                                    {isSaving ? "저장 중..." : "기록 저장"}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "students" && (
                    <div className="card p-6 animate-fade-in" style={{ backgroundColor: 'var(--surface)' }}>
                        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                            <User className="text-primary" style={{ width: '24px', height: '24px' }} /> 학생 목록
                        </h2>
                        <div className="mb-6 flex flex-col gap-3">
                            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <label className="text-sm font-semibold text-gray-700">정렬</label>
                                    <select
                                        value={studentSortOption}
                                        onChange={e => setStudentSortOption(e.target.value as StudentSortOption)}
                                        className="input-field"
                                        style={{ width: '220px', paddingTop: '8px', paddingBottom: '8px' }}
                                    >
                                        <option value="date_desc">날짜순 (기본)</option>
                                        <option value="student_id_asc">학번 오름차순</option>
                                        <option value="student_id_desc">학번 내림차순</option>
                                    </select>
                                </div>
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                    <div className="flex items-center gap-2">
                                        <label className="text-sm font-semibold text-gray-700">일괄 삭제</label>
                                        <select
                                            value={bulkDeleteMode}
                                            onChange={e => setBulkDeleteMode(e.target.value as BulkDeleteMode)}
                                            className="input-field"
                                            style={{ width: '180px', paddingTop: '8px', paddingBottom: '8px' }}
                                        >
                                            <option value="selected_students">선택 학생</option>
                                            <option value="all">전체 상담</option>
                                        </select>
                                    </div>
                                    <button
                                        onClick={() => {
                                            if (bulkDeleteMode === "all") {
                                                void handleDeleteAllConsultations()
                                            } else {
                                                void handleDeleteSelectedStudents(selectedStudentGroups)
                                            }
                                        }}
                                        className="btn btn-danger-ghost text-sm rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                                        style={{ padding: '8px 12px' }}
                                    >
                                        <Trash2 style={{ width: '14px', height: '14px' }} /> 삭제
                                    </button>
                                </div>
                            </div>
                            <div
                                className="border rounded-xl p-4 flex flex-col gap-3 bg-primary-light"
                            >
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <Sparkles style={{ width: '16px', height: '16px' }} className="text-primary" />
                                        <span className="text-sm font-bold text-gray-900">행동발달 초안 작성</span>
                                    </div>
                                    <span className="text-xs text-gray-600">
                                        대상 {behaviorTargetGroups.length}명 / 완료 {completedBehaviorCount} / 실패 {failedBehaviorCount}
                                    </span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
                                    <div className="flex items-center gap-2">
                                        <label className="text-sm font-semibold text-gray-700">모델</label>
                                        <select
                                            value={selectedModel}
                                            onChange={e => setSelectedModel(e.target.value)}
                                            className="input-field"
                                            style={{ paddingTop: '8px', paddingBottom: '8px' }}
                                        >
                                            {AVAILABLE_MODELS.map(model => (
                                                <option key={model.id} value={model.id}>
                                                    {model.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <label className="text-sm font-semibold text-gray-700">범위</label>
                                        <select
                                            value={behaviorGenerationMode}
                                            onChange={e => setBehaviorGenerationMode(e.target.value as BehaviorGenerationMode)}
                                            className="input-field"
                                            style={{ paddingTop: '8px', paddingBottom: '8px' }}
                                        >
                                            <option value="selected_students">선택 학생</option>
                                            <option value="all">전체 학생</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <label className="text-sm font-semibold text-gray-700">근거 방식</label>
                                        <select
                                            value={behaviorEvidenceMode}
                                            onChange={e => setBehaviorEvidenceMode(e.target.value as BehaviorEvidenceMode)}
                                            className="input-field"
                                            style={{ paddingTop: '8px', paddingBottom: '8px' }}
                                        >
                                            <option value="all_records">전체 기록 반영</option>
                                            <option value="selected_only">체크한 상담만 반영</option>
                                        </select>
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                        <button
                                            onClick={() => { void handleGenerateBehaviorDrafts() }}
                                            disabled={isGeneratingBehavior || behaviorTargetGroups.length === 0}
                                            className="btn btn-primary text-sm"
                                            style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}
                                        >
                                            {isGeneratingBehavior
                                                ? `생성 중... (${behaviorProgress.completed}/${behaviorProgress.total})`
                                                : "초안 생성"}
                                        </button>
                                        <button
                                            onClick={() => { void handleDownloadBehaviorExcel() }}
                                            disabled={isGeneratingBehavior || isExportingBehavior || behaviorDrafts.length === 0}
                                            className="btn btn-secondary text-sm"
                                            style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}
                                        >
                                            <Download style={{ width: '14px', height: '14px' }} /> {isExportingBehavior ? "내보내는 중..." : "엑셀 다운로드"}
                                        </button>
                                    </div>
                                </div>
                                <div className="text-xs text-gray-600 border rounded-lg px-3 py-2 bg-white">
                                    {behaviorEvidenceMode === "selected_only"
                                        ? `체크 상담 반영 기준: 학생 ${selectedBehaviorStudentCount}명 / 상담 ${selectedBehaviorConsultationCount}건 선택됨`
                                        : "전체 상담 반영 기준: 학생별 전체 상담 기록을 근거로 사용함"}
                                </div>
                                {behaviorGenerationMode === "selected_students" && selectedStudentKeys.length === 0 && (
                                    <p className="text-xs text-gray-600">
                                        선택 학생 모드에서는 먼저 체크박스로 학생을 선택해주세요.
                                    </p>
                                )}
                                {behaviorEvidenceMode === "selected_only" && (
                                    <p className="text-xs text-gray-600">
                                        학생 상세 카드에서 상담별 `행발 반영` 체크박스를 선택하면 해당 상담만 행발 근거로 사용합니다.
                                    </p>
                                )}
                                {behaviorEvidenceMode === "selected_only" && selectedOnlyMissingTargetCount > 0 && (
                                    <p className="text-xs text-amber-700">
                                        대상 학생 중 {selectedOnlyMissingTargetCount}명은 아직 선택된 상담이 없습니다.
                                    </p>
                                )}
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-gray-500">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={isAllStudentsSelected}
                                        onChange={() => {
                                            if (isAllStudentsSelected) {
                                                setSelectedStudentKeys([])
                                                setSelectedBehaviorConsultationMap({})
                                            } else {
                                                setSelectedStudentKeys(studentGroups.map(group => group.key))
                                                const nextMap: Record<string, string[]> = {}
                                                studentGroups.forEach(group => {
                                                    nextMap[group.key] = group.consultations.map(c => c.id).filter((id): id is string => Boolean(id))
                                                })
                                                setSelectedBehaviorConsultationMap(nextMap)
                                            }
                                        }}
                                        style={{ width: '16px', height: '16px' }}
                                    />
                                    전체 학생 선택 ({selectedStudentKeys.length}/{studentGroups.length})
                                </label>
                                <span>학생 기준 그룹화 / 기본 정렬: 최신 상담순</span>
                            </div>
                        </div>
                        {sortedBehaviorDrafts.length > 0 && (
                            <div className="mb-6 border rounded-xl bg-gray-50 p-4 animate-fade-in">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                        <Sparkles style={{ width: '14px', height: '14px' }} className="text-primary" /> 생성된 행동발달 초안
                                    </h3>
                                    <span className="text-xs text-gray-500">학생별 초안을 검토하고 필요 시 직접 수정할 수 있습니다.</span>
                                </div>
                                <div className="flex flex-col gap-3">
                                    {sortedBehaviorDrafts.map(draft => (
                                        <div key={draft.studentKey} className="border rounded-lg bg-white p-4">
                                            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 mb-3">
                                                <div>
                                                    <p className="font-bold text-gray-900">{draft.studentName}</p>
                                                    <p className="text-xs text-gray-500">
                                                        학번 {draft.studentId} / 상담 {draft.consultationCount}건 / 최신 상담 {draft.lastDate} {draft.lastTime}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className="badge"
                                                        style={{
                                                            backgroundColor: draft.status === "completed"
                                                                ? "#ecfdf3"
                                                                : draft.status === "failed"
                                                                    ? "#fef2f2"
                                                                    : draft.status === "generating"
                                                                        ? "#e0e7ff"
                                                                        : "#f3f4f6",
                                                            color: draft.status === "completed"
                                                                ? "#166534"
                                                                : draft.status === "failed"
                                                                    ? "#b91c1c"
                                                                    : draft.status === "generating"
                                                                        ? "#3730a3"
                                                                        : "#374151",
                                                        }}
                                                    >
                                                        {getBehaviorStatusLabel(draft.status)}
                                                    </span>
                                                    <button
                                                        onClick={() => { void handleRegenerateBehaviorDraft(draft.studentKey) }}
                                                        disabled={isGeneratingBehavior}
                                                        className="btn btn-secondary text-xs"
                                                        style={{ padding: '6px 10px' }}
                                                    >
                                                        다시 생성
                                                    </button>
                                                </div>
                                            </div>
                                            <textarea
                                                value={draft.content}
                                                onChange={e => handleBehaviorDraftContentChange(draft.studentKey, e.target.value)}
                                                placeholder="생성된 행동발달 초안을 확인하고 수정하세요."
                                                className="input-field"
                                                style={{ minHeight: '112px', resize: 'vertical' }}
                                                disabled={draft.status === "generating"}
                                            />
                                            {draft.status === "completed" && (
                                                <div className="flex items-center justify-between mt-2">
                                                    <button
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(draft.content)
                                                                .then(() => alert("행동발달 초안이 복사되었습니다."))
                                                                .catch(err => console.error("복사 실패:", err))
                                                        }}
                                                        className="btn btn-ghost text-xs flex items-center gap-1 text-gray-600 hover:text-primary"
                                                        style={{ padding: '4px 8px' }}
                                                    >
                                                        <Copy style={{ width: '14px', height: '14px' }} />
                                                        복사하기
                                                    </button>
                                                    <p className="text-xs text-gray-500 text-right">
                                                        공백 포함 {draft.content.length}자
                                                    </p>
                                                </div>
                                            )}
                                            {draft.status === "failed" && (
                                                <p className="text-xs text-red-600 mt-2">
                                                    생성 실패: {draft.errorMessage || "알 수 없는 오류"}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-1 gap-4">
                            {studentGroups.map((student) => {
                                const selectedBehaviorCount = selectedBehaviorConsultationMap[student.key]?.length ?? 0
                                return (
                                    <div key={student.key} className="border rounded-xl bg-gray-50 overflow-hidden">
                                        <div
                                            className="p-4 flex justify-between items-center cursor-pointer hover:bg-white transition-colors"
                                            onClick={() => setExpandedStudentId(expandedStudentId === student.key ? null : student.key)}
                                        >
                                            <div className="flex items-start gap-3">
                                                <label
                                                    className="mt-1 cursor-pointer select-none"
                                                    onClick={e => e.stopPropagation()}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedStudentKeys.includes(student.key)}
                                                        onChange={() => toggleStudentSelection(student.key, student.consultations)}
                                                        style={{ width: '16px', height: '16px' }}
                                                    />
                                                </label>
                                                <div>
                                                    <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                                                        {student.name}
                                                    </h3>
                                                    <p className="text-sm text-gray-500">학번: {student.id} | 마지막 상담: {student.lastDate} {student.lastTime}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {behaviorEvidenceMode === "selected_only" && (
                                                    <span
                                                        className="badge bg-primary-light text-primary"
                                                    >
                                                        행발 선택 {selectedBehaviorCount}
                                                    </span>
                                                )}
                                                <span className="badge badge-primary">{student.count}</span>
                                                <ChevronLeft style={{ width: '20px', height: '20px', transform: expandedStudentId === student.key ? 'rotate(-90deg)' : 'rotate(0deg)' }} className="text-gray-400" />
                                            </div>
                                        </div>

                                        {expandedStudentId === student.key && (
                                            <div className="border-t bg-white p-4 animate-fade-in">
                                                <div className="flex justify-end mb-4">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); void handleDeleteStudent(student) }}
                                                        className="btn btn-danger-ghost text-sm flex items-center gap-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                                                        style={{ padding: '6px 12px' }}
                                                    >
                                                        <Trash2 style={{ width: '16px', height: '16px' }} /> 학생 데이터 전체 삭제
                                                    </button>
                                                </div>
                                                <div className="space-y-3">
                                                    {student.consultations.map(c => {
                                                        const isBehaviorChecked = Boolean(c.id && selectedBehaviorConsultationMap[student.key]?.includes(c.id))

                                                        return (
                                                            <div key={c.id || `${student.key}-${c.date}-${c.time}-${c.topic || ""}`} className="border rounded-lg p-4 hover:shadow-sm transition-shadow">
                                                                <div className="flex justify-between items-start mb-2">
                                                                    <div className="flex flex-col gap-2">
                                                                        <label
                                                                            className="flex items-center gap-2 text-xs font-semibold text-gray-600 cursor-pointer select-none"
                                                                            onClick={event => event.stopPropagation()}
                                                                        >
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={isBehaviorChecked}
                                                                                onChange={() => {
                                                                                    if (c.id) {
                                                                                        toggleBehaviorConsultationSelection(student.key, c.id)
                                                                                    }
                                                                                }}
                                                                                disabled={!c.id}
                                                                                style={{ width: '14px', height: '14px' }}
                                                                            />
                                                                            행발 반영
                                                                        </label>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-sm font-bold text-gray-900">{c.date}</span>
                                                                            <span className="text-xs text-gray-500">{c.time}</span>
                                                                            <span className="badge badge-primary text-xs" style={{ padding: '2px 8px' }}>{c.topic || "일반"}</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <button
                                                                            onClick={(event) => {
                                                                                event.stopPropagation()
                                                                                if (editingConsultationId === c.id) {
                                                                                    cancelConsultationEdit()
                                                                                    return
                                                                                }
                                                                                startConsultationEdit(c)
                                                                            }}
                                                                            className={`btn text-xs rounded-lg flex items-center gap-1 ${editingConsultationId === c.id ? "btn-primary text-white" : "btn-ghost text-gray-600"}`}
                                                                            style={{ padding: '6px 10px' }}
                                                                        >
                                                                            <PencilLine style={{ width: '14px', height: '14px' }} />
                                                                            {editingConsultationId === c.id ? "취소" : "수정"}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => { if (c.id) void handleDelete(c.id) }}
                                                                            className="btn btn-danger-ghost text-xs rounded-lg bg-red-50 text-red-600 hover:bg-red-100 flex items-center gap-1"
                                                                            style={{ padding: '6px 10px' }}
                                                                        >
                                                                            <Trash2 style={{ width: '14px', height: '14px' }} />
                                                                            삭제
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                {editingConsultationId === c.id ? (
                                                                    renderConsultationEditForm(c)
                                                                ) : (
                                                                    <>
                                                                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.originalContent}</p>
                                                                        {c.aiSummary && (
                                                                            <div className="mt-3 bg-yellow-50 p-4 rounded-lg border border-yellow-100">
                                                                                <span className="font-bold text-yellow-800 block mb-2 text-xs flex items-center gap-1"><Sparkles style={{ width: '12px', height: '12px' }} /> AI 요약</span>
                                                                                <MarkdownRenderer content={c.aiSummary} />
                                                                            </div>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                            {studentGroups.length === 0 && (
                                <div className="text-center py-12 text-gray-500">
                                    등록된 학생이 없습니다.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === "stats" && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
                        <div className="card p-6 bg-white">
                            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <FileText className="text-primary" style={{ width: '20px', height: '20px' }} /> 총 상담 건수
                            </h3>
                            <div className="text-4xl font-extrabold text-gray-900">{totalConsultations}</div>
                            <p className="text-gray-500 text-sm mt-2">누적된 전체 상담 기록입니다.</p>
                        </div>
                        <div className="card p-6 bg-white">
                            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <Sparkles className="text-secondary" style={{ width: '20px', height: '20px' }} /> AI 요약 활용
                            </h3>
                            <div className="text-4xl font-extrabold text-gray-900">{aiSummaryCount}</div>
                            <p className="text-gray-500 text-sm mt-2">AI 요약 기능을 사용한 상담입니다.</p>
                        </div>
                        <div className="card p-6 bg-white">
                            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <User className="text-green-600" style={{ width: '20px', height: '20px' }} /> 상담 학생 수
                            </h3>
                            <div className="text-4xl font-extrabold text-gray-900">{studentCount}</div>
                            <p className="text-gray-500 text-sm mt-2">상담을 진행한 총 학생 수입니다.</p>
                        </div>

                        <div className="card p-6 bg-white" style={{ gridColumn: 'span 3' }}>
                            <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
                                <BarChart3 className="text-primary" style={{ width: '20px', height: '20px' }} /> 월별 상담 추이 (최근 6개월)
                            </h3>
                            <div className="flex items-end justify-between gap-4" style={{ height: '256px', padding: '0 16px' }}>
                                {monthlyStats.map((stat, i) => (
                                    <div key={i} className="flex flex-col items-center gap-2 flex-1 group">
                                        <div className="relative w-full flex justify-center items-end bg-gray-100 rounded-t-lg overflow-hidden" style={{ height: '192px' }}>
                                            <div
                                                className="w-full bg-primary group-hover:opacity-100 transition-all"
                                                style={{ height: `${(stat.count / maxCount) * 100}%`, opacity: 0.8 }}
                                            ></div>
                                            <div className="absolute text-xs font-bold text-white" style={{ bottom: '8px', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                                                {stat.count > 0 ? `${stat.count}` : ""}
                                            </div>
                                        </div>
                                        <span className="text-sm font-medium text-gray-600">{stat.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>
                )}

                {activeTab === "admin" && (
                    teacherRole === "admin" ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                            <div className="card p-6 bg-white">
                                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                                    <ShieldCheck className="text-primary" style={{ width: '24px', height: '24px' }} /> 관리자 권한
                                </h2>
                                <p className="text-gray-600 mb-4">현재 계정은 관리자 권한으로 로그인되어 있습니다.</p>
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center justify-between border rounded-lg px-4 py-3">
                                        <span className="text-sm text-gray-500">계정</span>
                                        <span className="text-sm font-semibold text-gray-900">{teacherEmail || "-"}</span>
                                    </div>
                                    <div className="flex items-center justify-between border rounded-lg px-4 py-3">
                                        <span className="text-sm text-gray-500">권한</span>
                                        <span className="badge badge-primary">admin</span>
                                    </div>
                                    <div className="flex items-center justify-between border rounded-lg px-4 py-3">
                                        <span className="text-sm text-gray-500">잠금 정책</span>
                                        <span className="text-sm font-semibold text-gray-900">10회 실패 시 잠금</span>
                                    </div>
                                </div>
                            </div>

                            <div className="card p-6 bg-white">
                                <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                                    <ShieldCheck className="text-primary" style={{ width: '20px', height: '20px' }} /> 계정 잠금 해제
                                </h3>
                                <p className="text-sm text-gray-500 mb-4">이메일/비밀번호 로그인 10회 실패로 잠긴 계정을 해제합니다.</p>
                                <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
                                    <input
                                        type="email"
                                        value={unlockEmail}
                                        onChange={e => setUnlockEmail(e.target.value)}
                                        placeholder="잠금 해제할 계정 이메일"
                                        className="input-field"
                                        style={{ flex: 1, minWidth: '240px' }}
                                    />
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => { void handleUnlockAccount() }}
                                        disabled={isUnlocking}
                                    >
                                        {isUnlocking ? "해제 중..." : "잠금 해제"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="card p-8 bg-white animate-fade-in text-center">
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">관리자 권한이 필요합니다</h2>
                            <p className="text-gray-500">현재 계정으로는 관리자 기능에 접근할 수 없습니다.</p>
                        </div>
                    )
                )}
            </main>
        </div>
    )
}
