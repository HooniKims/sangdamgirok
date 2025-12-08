"use client"

import { useState, useEffect } from "react"
import { Sparkles, Lock, ArrowRight } from "lucide-react"

export default function AuthGuard({ children }: { children: React.ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [password, setPassword] = useState("")
    const [error, setError] = useState(false)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const auth = localStorage.getItem("isAuthenticated")
        if (auth === "true") setIsAuthenticated(true)
        setIsLoading(false)
    }, [])

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault()
        if (password === "teacher1234") {
            localStorage.setItem("isAuthenticated", "true")
            setIsAuthenticated(true)
        } else {
            setError(true)
        }
    }

    if (isLoading) return null

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <div style={{ maxWidth: '400px', width: '100%' }}>
                    <div className="text-center mb-8">
                        <div className="bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg" style={{ width: '64px', height: '64px', transform: 'rotate(3deg)' }}>
                            <Sparkles className="text-white" style={{ width: '32px', height: '32px' }} />
                        </div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">Sangdam Note</h1>
                        <p className="text-gray-500">선생님을 위한 스마트한 상담 관리</p>
                    </div>

                    <div className="card p-8 bg-white shadow-xl">
                        <form onSubmit={handleLogin} className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">비밀번호</label>
                                <div className="relative">
                                    <Lock className="absolute text-gray-400" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', width: '20px', height: '20px' }} />
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => { setPassword(e.target.value); setError(false); }}
                                        className="input-field"
                                        style={{ paddingLeft: '40px', borderColor: error ? '#ef4444' : undefined }}
                                        placeholder="비밀번호를 입력하세요"
                                    />
                                </div>
                                {error && <p className="text-sm text-red-500 mt-2 ml-1">비밀번호가 올바르지 않습니다.</p>}
                            </div>

                            <button type="submit" className="btn btn-primary w-full py-3 text-lg gap-2 group">
                                로그인하기
                                <ArrowRight style={{ width: '20px', height: '20px' }} className="group-hover:translate-x-1 transition-transform" />
                            </button>
                        </form>
                    </div>

                    <p className="text-center text-gray-400 text-sm mt-8">
                        © {new Date().getFullYear()} HooniKim All right reserved.
                    </p>
                </div>
            </div>
        )
    }

    return <>{children}</>
}
