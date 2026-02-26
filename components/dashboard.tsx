"use client"

import { useState, useEffect } from "react"
import { onAuthStateChanged, signOut } from "firebase/auth"
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, Timestamp, where } from "firebase/firestore"
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
    Sparkles
} from "lucide-react"
import { Consultation } from "@/types"
import { generateWithRetry, AVAILABLE_MODELS, DEFAULT_MODEL } from "@/utils/ollamaClient"
import { cleanMetaInfo } from "@/utils/textProcessor"

const HOLIDAYS: { [key: string]: string } = {
    "01-01": "신정", "03-01": "3.1절", "05-05": "어린이날", "06-06": "현충일",
    "08-15": "광복절", "10-03": "개천절", "10-09": "한글날", "12-25": "크리스마스",
    "2024-02-09": "설날", "2024-02-10": "설날", "2024-02-11": "설날", "2024-02-12": "대체공휴일",
    "2024-09-16": "추석", "2024-09-17": "추석", "2024-09-18": "추석",
    "2025-01-28": "설날", "2025-01-29": "설날", "2025-01-30": "설날",
    "2025-10-06": "추석", "2025-10-07": "추석",
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

export default function Dashboard() {
    const [currentMonth, setCurrentMonth] = useState(new Date())
    const [selectedDate, setSelectedDate] = useState<Date>(new Date())
    const [consultations, setConsultations] = useState<Consultation[]>([])

    // Navigation State
    const [activeTab, setActiveTab] = useState<"calendar" | "students" | "stats">("calendar")
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

    // Student List State
    const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null)

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            setTeacherId(user?.uid ?? null)
            setTeacherEmail(user?.email ?? "")
        })

        return () => unsubscribeAuth()
    }, [])

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
            const systemMessage = `당신은 학교 교사의 학생 상담 기록을 정리하는 전문가입니다.
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
→ 새로운 내용 추가 금지, 원본 내용만 다듬어서 작성`

            const prompt = `날짜: ${format(selectedDate, "yyyy-MM-dd")} ${formData.time}\n학생: ${formData.studentName} (${formData.studentId})\n주제: ${formData.topic}\n내용: ${formData.content}\n\n위 형식대로 간결하게 정리해주세요:`

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

    const handleDelete = async (id: string) => {
        if (confirm("삭제하시겠습니까?")) await deleteDoc(doc(db, "consultations", id))
    }

    const handleDeleteStudent = async (studentName: string) => {
        if (confirm(`'${studentName}' 학생의 모든 상담 기록을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
            const targetConsultations = consultations.filter(c => c.studentName === studentName)
            try {
                await Promise.all(targetConsultations.map(c => deleteDoc(doc(db, "consultations", c.id!))))
                setExpandedStudentId(null)
            } catch {
                alert("삭제 중 오류가 발생했습니다.")
            }
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

    // Students List Data
    const students = Array.from(new Set(consultations.map(c => c.studentName))).map(name => {
        const studentConsultations = consultations.filter(c => c.studentName === name)
        return {
            name,
            id: studentConsultations[0].studentId,
            count: studentConsultations.length,
            lastDate: studentConsultations[0].date
        }
    }).sort((a, b) => b.lastDate.localeCompare(a.lastDate))

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
        <div className="min-h-screen flex flex-col bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b sticky top-0 z-20" style={{ height: 'var(--header-height)' }}>
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
                        </nav>
                    </div>
                    <div className="flex items-center gap-3 relative">
                        {teacherEmail && <span className="text-sm text-gray-500 hidden md:inline">{teacherEmail}</span>}
                        <button
                            onClick={toggleSearch}
                            className={`btn btn-ghost p-2 rounded-full ${isSearchOpen ? 'bg-gray-100 text-primary' : ''}`}
                            data-tooltip-bottom="학생 검색"
                        >
                            <Search style={{ width: '20px', height: '20px' }} />
                        </button>

                        <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border)', margin: '0 4px' }}></div>
                        <button
                            onClick={() => { void handleLogout() }}
                            className="btn btn-danger-ghost text-sm font-medium flex items-center gap-2"
                            data-tooltip-bottom="로그아웃"
                        >
                            <LogOut style={{ width: '16px', height: '16px' }} />
                            <span className="hidden sm:inline">로그아웃</span>
                        </button>
                    </div>
                </div>
            </header>

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
                            <div className="card p-6 bg-white">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-xl font-bold text-gray-900" style={{ whiteSpace: 'nowrap' }}>{format(currentMonth, "yyyy년 M월", { locale: ko })}</h2>
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
                                    {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
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
                            <div className="card p-6 text-white" style={{ backgroundColor: '#312e81', position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '128px', height: '128px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '50%', filter: 'blur(40px)' }}></div>
                                <h3 className="text-lg font-bold mb-4" style={{ position: 'relative', zIndex: 1 }}>이번 달 상담 현황</h3>
                                <div className="grid grid-cols-2 gap-4" style={{ position: 'relative', zIndex: 1 }}>
                                    <div>
                                        <div className="text-xs font-medium mb-1" style={{ color: '#a5b4fc' }}>총 상담</div>
                                        <div className="text-2xl font-bold">{consultations.filter(c => c.date.startsWith(format(currentMonth, "yyyy-MM"))).length}건</div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-medium mb-1" style={{ color: '#a5b4fc' }}>AI 요약</div>
                                        <div className="text-2xl font-bold">{consultations.filter(c => c.date.startsWith(format(currentMonth, "yyyy-MM")) && c.aiSummary).length}건</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Workspace */}
                        <div className="lg:col-span-8">
                            <div className="card bg-white flex flex-col" style={{ minHeight: '600px' }}>
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
                                                ? `"${searchQuery}"에 대한 검색 결과가 ${displayList.length}건 있습니다.`
                                                : "상담 일정을 확인하고 관리하세요."}
                                        </p>
                                    </div>

                                    <div className="flex bg-gray-50 p-1 rounded-xl border">
                                        <button
                                            onClick={() => setViewMode("list")}
                                            className={`btn btn-ghost text-sm font-semibold ${viewMode === "list" || viewMode === "search" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}
                                            style={{ padding: '8px 16px', borderRadius: '8px' }}
                                        >
                                            상담 목록 <span className="badge badge-primary" style={{ marginLeft: '6px', fontSize: '10px', padding: '2px 6px' }}>{displayList.length}</span>
                                        </button>
                                        <button
                                            onClick={() => setViewMode("write")}
                                            className={`btn btn-ghost text-sm font-semibold ${viewMode === "write" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}
                                            style={{ padding: '8px 16px', borderRadius: '8px' }}
                                        >
                                            + 새 상담 작성
                                        </button>
                                    </div>
                                </div>

                                {/* Workspace Content */}
                                <div className="p-6 flex-1 bg-gray-50">
                                    {(viewMode === "list" || viewMode === "search") ? (
                                        displayList.length === 0 ? (
                                            <div className="h-full flex flex-col items-center justify-center text-center py-20">
                                                <div className="bg-white rounded-2xl flex items-center justify-center mb-6 border" style={{ width: '80px', height: '80px' }}>
                                                    {viewMode === "search" ? <Search className="text-gray-300" style={{ width: '40px', height: '40px' }} /> : <FileText className="text-gray-300" style={{ width: '40px', height: '40px' }} />}
                                                </div>
                                                <h3 className="text-lg font-bold text-gray-900 mb-2">
                                                    {viewMode === "search" ? "검색 결과가 없습니다" : "등록된 상담이 없습니다"}
                                                </h3>
                                                <p className="text-gray-500 mb-8">
                                                    {viewMode === "search" ? (
                                                        "다른 키워드로 검색해보세요."
                                                    ) : (
                                                        <>
                                                            선택하신 날짜에 예정된 상담 일정이 없습니다.<br />
                                                            새로운 상담을 등록해보세요.
                                                        </>
                                                    )}
                                                </p>
                                                {viewMode !== "search" && (
                                                    <button onClick={() => setViewMode("write")} className="btn btn-primary">
                                                        상담 일정 등록하기
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-4">
                                                {displayList.map(c => (
                                                    <div key={c.id} className="card p-6 bg-white hover:shadow-md transition-all">
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
                                                            <button onClick={() => handleDelete(c.id!)} className="btn btn-danger-ghost p-2 rounded-lg" data-tooltip="삭제">
                                                                <Trash2 style={{ width: '16px', height: '16px' }} />
                                                            </button>
                                                        </div>

                                                        <div style={{ paddingLeft: '52px' }}>
                                                            <div className="badge badge-primary mb-3" style={{ backgroundColor: '#f3f4f6', color: '#4b5563' }}>
                                                                {c.topic || "일반 상담"}
                                                            </div>
                                                            <p className="text-gray-900 leading-relaxed whitespace-pre-wrap mb-4">{c.originalContent}</p>

                                                            {c.aiSummary && (
                                                                <div className="rounded-xl p-5" style={{ borderColor: '#fcd34d', backgroundColor: '#fffbeb', border: '1px solid #fcd34d' }}>
                                                                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-yellow-200">
                                                                        <Sparkles style={{ width: '16px', height: '16px', color: '#b45309' }} />
                                                                        <span className="text-sm font-bold" style={{ color: '#b45309' }}>AI 요약 노트</span>
                                                                    </div>
                                                                    <MarkdownRenderer content={c.aiSummary} />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    ) : (
                                        <div className="card p-8 bg-white">
                                            <div className="grid grid-cols-2 gap-6 mb-6">
                                                <div className="flex flex-col gap-2">
                                                    <label className="text-sm font-bold text-gray-900">시간</label>
                                                    <input type="time" value={formData.time} onChange={e => setFormData({ ...formData, time: e.target.value })} className="input-field" />
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    <label className="text-sm font-bold text-gray-900">상담 주제</label>
                                                    <input type="text" placeholder="예: 진로, 교우관계" value={formData.topic} onChange={e => setFormData({ ...formData, topic: e.target.value })} className="input-field" />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-6 mb-6">
                                                <div className="flex flex-col gap-2">
                                                    <label className="text-sm font-bold text-gray-900">학번</label>
                                                    <input type="text" placeholder="10101" value={formData.studentId} onChange={e => setFormData({ ...formData, studentId: e.target.value })} className="input-field" />
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    <label className="text-sm font-bold text-gray-900">이름 <span className="text-danger">*</span></label>
                                                    <input type="text" placeholder="홍길동" value={formData.studentName} onChange={e => setFormData({ ...formData, studentName: e.target.value })} className="input-field" />
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-2 mb-8">
                                                <label className="text-sm font-bold text-gray-900">상담 내용 <span className="text-danger">*</span></label>
                                                <textarea
                                                    placeholder="상담 내용을 상세히 기록해주세요..."
                                                    value={formData.content}
                                                    onChange={e => setFormData({ ...formData, content: e.target.value })}
                                                    className="input-field"
                                                    style={{ height: '160px', resize: 'none' }}
                                                />
                                            </div>

                                            {/* AI 모델 선택 */}
                                            <div className="flex flex-col gap-2 mb-8">
                                                <label className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                                    <Sparkles style={{ width: '14px', height: '14px' }} className="text-primary" /> AI 모델 선택
                                                </label>
                                                <select
                                                    value={selectedModel}
                                                    onChange={e => setSelectedModel(e.target.value)}
                                                    className="input-field"
                                                    style={{ cursor: 'pointer' }}
                                                >
                                                    {AVAILABLE_MODELS.map(m => (
                                                        <option key={m.id} value={m.id}>
                                                            {m.name} — {m.description}
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
                                                        style={{ height: '128px', resize: 'none', backgroundColor: '#fffbeb', borderColor: '#fcd34d' }}
                                                    />
                                                </div>
                                            )}

                                            <div className="flex gap-4">
                                                <button
                                                    onClick={handleSummarize}
                                                    disabled={isSummarizing || !formData.content}
                                                    className="btn btn-secondary flex-1 gap-2"
                                                    style={{ color: '#b45309', borderColor: '#fcd34d', backgroundColor: '#fffbeb' }}
                                                >
                                                    {isSummarizing ? "분석 중..." : <><Sparkles style={{ width: '20px', height: '20px' }} /> AI 요약하기</>}
                                                </button>
                                                <button
                                                    onClick={() => handleSave(!!summary)}
                                                    disabled={isSaving}
                                                    className="btn btn-primary flex-2"
                                                    style={{ flex: 2 }}
                                                >
                                                    {isSaving ? "저장 중..." : "기록 저장하기"}
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
                    <div className="card bg-white p-6 animate-fade-in">
                        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                            <User className="text-primary" style={{ width: '24px', height: '24px' }} /> 학생 목록
                        </h2>
                        <div className="grid grid-cols-1 gap-4">
                            {students.map((student, i) => (
                                <div key={i} className="border rounded-xl bg-gray-50 overflow-hidden">
                                    <div
                                        className="p-4 flex justify-between items-center cursor-pointer hover:bg-white transition-colors"
                                        onClick={() => setExpandedStudentId(expandedStudentId === student.name ? null : student.name)}
                                    >
                                        <div>
                                            <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                                                {student.name}
                                            </h3>
                                            <p className="text-sm text-gray-500">학번: {student.id} | 마지막 상담: {student.lastDate}</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="badge badge-primary">{student.count}건</span>
                                            <ChevronLeft style={{ width: '20px', height: '20px', transform: expandedStudentId === student.name ? 'rotate(-90deg)' : 'rotate(0deg)' }} className="text-gray-400" />
                                        </div>
                                    </div>

                                    {expandedStudentId === student.name && (
                                        <div className="border-t bg-white p-4 animate-fade-in">
                                            <div className="flex justify-end mb-4">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteStudent(student.name); }}
                                                    className="btn btn-danger-ghost text-sm flex items-center gap-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                                                    style={{ padding: '6px 12px' }}
                                                >
                                                    <Trash2 style={{ width: '16px', height: '16px' }} /> 학생 데이터 전체 삭제
                                                </button>
                                            </div>
                                            <div className="space-y-3">
                                                {consultations.filter(c => c.studentName === student.name).map(c => (
                                                    <div key={c.id} className="border rounded-lg p-4 hover:shadow-sm transition-shadow">
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-bold text-gray-900">{c.date}</span>
                                                                <span className="text-xs text-gray-500">{c.time}</span>
                                                                <span className="badge badge-primary text-xs" style={{ padding: '2px 8px' }}>{c.topic || "일반"}</span>
                                                            </div>
                                                            <button onClick={() => handleDelete(c.id!)} className="text-gray-400 hover:text-red-500 p-1">
                                                                <Trash2 style={{ width: '16px', height: '16px' }} />
                                                            </button>
                                                        </div>
                                                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.originalContent}</p>
                                                        {c.aiSummary && (
                                                            <div className="mt-3 bg-yellow-50 p-4 rounded-lg border border-yellow-100">
                                                                <span className="font-bold text-yellow-800 block mb-2 text-xs flex items-center gap-1"><Sparkles style={{ width: '12px', height: '12px' }} /> AI 요약</span>
                                                                <MarkdownRenderer content={c.aiSummary} />
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {students.length === 0 && (
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
                                                {stat.count > 0 ? `${stat.count}건` : ''}
                                            </div>
                                        </div>
                                        <span className="text-sm font-medium text-gray-600">{stat.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}
