"use client";

import { useState, useEffect, useRef } from "react";
import { usePageTitle } from "@/modules/core/hooks/usePageTitle";
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/modules/core/hooks/use-toast";
import { 
  Bot, 
  Send, 
  Sparkles, 
  Trash2, 
  ShieldAlert, 
  Terminal, 
  Loader2, 
  Server, 
  FileText, 
  Wifi, 
  Truck, 
  Database,
  Smartphone,
  Cpu,
  Key,
  Laptop,
  ArrowLeft,
  RefreshCw
} from "lucide-react";
import Link from "next/link";
import { chatWithAiAuditorAction } from "@/modules/core/lib/ai-auditor-service";
import { getAiSettingsAction } from "@/modules/notifications/lib/actions";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export default function ItAiAuditorPage() {
  const { setTitle } = usePageTitle();
  const { isAuthorized, isLoading: authLoading } = useAuthorization(["ai:audit:logs"]);
  const { toast } = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [allowedTables, setAllowedTables] = useState<string[]>([]);
  const [activeProvider, setActiveProvider] = useState<string>("gemini");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTitle("Asistente IA de Soporte & TI");
    loadSettings();

    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: `👋 **¡Hola! Soy el Asistente IA de Soporte Técnico y Auditoría TI de Clic-Tools.**\n\nEstoy conectado a las bases de datos de hardware ITAM, licencias de software, notas técnicas, servidores, celulares Android y telemetría de choferes.\n\n💡 *Selecciona un atajo rápido a la izquierda o escribe cualquier consulta técnica.*`,
        timestamp: new Date().toLocaleTimeString("es-CR"),
      },
    ]);
  }, [setTitle]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  const loadSettings = async () => {
    try {
      const settings = await getAiSettingsAction();
      if (settings) {
        setActiveProvider(settings.provider || "gemini");
        if (settings.auditorAllowedTables) {
          try {
            setAllowedTables(JSON.parse(settings.auditorAllowedTables));
          } catch {
            setAllowedTables(["core_logs", "it_assets", "fleet_registered_devices"]);
          }
        }
      }
    } catch (e) {
      console.warn("Error cargando settings de IA:", e);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || isSending) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: query,
      timestamp: new Date().toLocaleTimeString("es-CR"),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput("");
    setIsSending(true);

    try {
      const history = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await chatWithAiAuditorAction({
        message: query,
        conversationHistory: history,
      });

      if (res.success) {
        const assistantMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: res.reply,
          timestamp: new Date().toLocaleTimeString("es-CR"),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        toast({
          title: "Error de Auditoría",
          description: res.error || "No se pudo generar el diagnóstico.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Fallo de Comunicación",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: "welcome-clean",
        role: "assistant",
        content: `🧹 **Sesión reiniciada.** ¿Qué área de TI, inventario o bitácora deseas auditar ahora?`,
        timestamp: new Date().toLocaleTimeString("es-CR"),
      },
    ]);
  };

  if (authLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <h2 className="text-lg font-bold">Acceso Denegado</h2>
        <p className="text-sm text-muted-foreground">
          No tienes el permiso requerido (<code>ai:audit:logs</code>) para usar el Asistente IA de TI.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 max-w-6xl">
      {/* Header Ejecutivo */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-background border p-4 rounded-xl shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/it-tools">
            <Button variant="ghost" size="icon" className="rounded-full h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="p-2.5 rounded-xl bg-purple-600/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            <Terminal className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              Asistente IA de Soporte & Auditoría TI
              <Badge variant="outline" className="text-xs font-mono uppercase bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30">
                {activeProvider}
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground">
              Diagnóstico en tiempo real sobre {allowedTables.length} tablas de SQLite (Hardware, Software, Celulares y Logs).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <Button variant="outline" size="sm" onClick={handleClearChat} className="text-xs gap-1.5">
            <Trash2 className="h-3.5 w-3.5" /> Limpiar Sesión
          </Button>
        </div>
      </div>

      {/* Grid Principal: Chat y Panel Lateral */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Atajos Rápidos / Contexto */}
        <div className="lg:col-span-1 space-y-3">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-purple-500" /> Atajos de TI
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {[
                {
                  label: "📑 Auditar Todos los Logs (Últimas 6h)",
                  prompt: "Audita todos los eventos, advertencias y excepciones en core_logs y ops_driver_logs en los logs de las últimas 6 horas.",
                  icon: Server,
                },
                {
                  label: "📶 Conexiones & Sockets Choferes (6h)",
                  prompt: "Analiza fallas de red, SocketException, WireGuard y sincronizaciones en ops_driver_logs en los logs de las últimas 6 horas.",
                  icon: Wifi,
                },
                {
                  label: "🚨 Errores Críticos del Servidor (6h)",
                  prompt: "¿Cuáles fueron los errores más críticos (WARN/ERROR) registrados en core_logs en los logs de las últimas 6 horas y cuál es su causa raíz?",
                  icon: ShieldAlert,
                },
                {
                  label: "📱 Celulares Android & MDM (6h)",
                  prompt: "Audita la flota de celulares en fleet_registered_devices: versiones de APK desactualizadas, fallos OTA o batería baja en los logs de las últimas 6 horas.",
                  icon: Smartphone,
                },
                {
                  label: "💻 Inventario & Custodia ITAM",
                  prompt: "Audita el estado de computadoras y servidores en it_assets: ¿cuáles están disponibles, asignados o en reparación?",
                  icon: Laptop,
                },
                {
                  label: "🔑 Licencias por Vencer / Libres",
                  prompt: "Revisa las licencias en it_asset_licenses e it_licenses_catalog: ¿cuáles están próximas a vencer o sin asignar?",
                  icon: Key,
                },
                {
                  label: "📋 Notas Técnicas y Procedimientos",
                  prompt: "Consulta las notas técnicas y procedimientos documentados en it_notes y resume las recomendaciones clave.",
                  icon: FileText,
                },
              ].map((shortcut, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setInput(shortcut.prompt);
                    toast({
                      title: "Plantilla de Consulta Cargada ✍️",
                      description: "Puedes complementarla o presionar Enter / Enviar.",
                      duration: 2500,
                    });
                  }}
                  className="w-full justify-start text-left text-xs h-auto py-2.5 px-3 whitespace-normal leading-snug border-border/80 bg-background text-foreground hover:bg-purple-600 hover:text-white dark:hover:bg-purple-600 dark:hover:text-white transition-all shadow-sm group"
                >
                  <shortcut.icon className="h-3.5 w-3.5 mr-2 shrink-0 text-purple-600 dark:text-purple-400 group-hover:text-white transition-colors" />
                  <span className="font-medium">{shortcut.label}</span>
                </Button>
              ))}
            </CardContent>
          </Card>

          {/* Tablas con Permiso */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 text-purple-500" /> Tablas en Contexto ({allowedTables.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
                {allowedTables.map((t) => (
                  <Badge key={t} variant="secondary" className="text-[9px] font-mono py-0 px-1.5">
                    {t}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Consola de Chat Interactiva */}
        <Card className="lg:col-span-3 shadow-md flex flex-col h-[650px] border-purple-500/20">
          <CardHeader className="py-3 px-4 border-b bg-muted/20 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold text-muted-foreground font-mono">Consola Forense de Soporte TI</span>
            </div>
            <span className="text-[11px] text-muted-foreground">Markdown & Diagnóstico Habilitado</span>
          </CardHeader>

          {/* Área de Mensajes */}
          <CardContent className="flex-1 p-4 overflow-hidden relative">
            <div ref={scrollRef} className="h-full overflow-y-auto space-y-4 pr-2">
              {messages.map((msg) => {
                const isUser = msg.role === "user";
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    {!isUser && (
                      <div className="h-7 w-7 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                        <Bot className="h-4 w-4" />
                      </div>
                    )}
                    <div
                      className={`rounded-2xl px-5 py-4 max-w-[90%] md:max-w-[85%] text-xs leading-relaxed shadow-sm transition-all ${
                        isUser
                          ? "bg-purple-600 text-white font-medium ml-auto"
                          : "bg-card border border-border/80 text-foreground"
                      }`}
                    >
                      {isUser ? (
                        <div className="whitespace-pre-wrap font-sans text-xs">{msg.content}</div>
                      ) : (
                        <div className="space-y-3 font-sans text-xs">
                          {msg.content.split("\n\n").map((block, bIdx) => {
                            const trimmed = block.trim();
                            if (!trimmed) return null;

                            // Encabezados H2 / H3
                            if (trimmed.startsWith("## ")) {
                              return (
                                <h2 key={bIdx} className="font-bold text-sm text-purple-700 dark:text-purple-300 mt-3 border-b border-purple-500/20 pb-1 flex items-center gap-2">
                                  {trimmed.replace("## ", "")}
                                </h2>
                              );
                            }
                            if (trimmed.startsWith("### ")) {
                              return (
                                <h3 key={bIdx} className="font-bold text-xs uppercase tracking-wider text-purple-600 dark:text-purple-400 mt-2.5 pb-0.5">
                                  {trimmed.replace("### ", "")}
                                </h3>
                              );
                            }
                            if (trimmed.startsWith("#### ")) {
                              return (
                                <h4 key={bIdx} className="font-semibold text-xs text-foreground/90 mt-1.5">
                                  {trimmed.replace("#### ", "")}
                                </h4>
                              );
                            }

                            // Bloques de código / JSON
                            if (trimmed.startsWith("```")) {
                              const codeLines = trimmed.replace(/^```[a-z0-9_-]*\n?/i, "").replace(/```$/, "");
                              return (
                                <div key={bIdx} className="my-2 rounded-xl overflow-hidden border border-border/60 shadow-inner bg-slate-950 text-slate-100">
                                  <div className="px-3 py-1 bg-slate-900 border-b border-slate-800 text-[10px] font-mono text-muted-foreground flex justify-between">
                                    <span>Trazas / Logs</span>
                                  </div>
                                  <pre className="p-3 font-mono text-[11px] leading-relaxed overflow-x-auto text-emerald-400">
                                    <code>{codeLines}</code>
                                  </pre>
                                </div>
                              );
                            }

                            // Tablas completas en Markdown
                            if (trimmed.includes("|") && trimmed.includes("\n|")) {
                              const tableLines = trimmed.split("\n").filter(r => r.trim().startsWith("|"));
                              return (
                                <div key={bIdx} className="overflow-x-auto my-2.5 rounded-xl border border-border bg-muted/10 shadow-sm">
                                  <table className="w-full text-[11px] text-left border-collapse">
                                    <tbody>
                                      {tableLines.map((row, rIdx) => {
                                        if (row.includes("---")) return null;
                                        const cols = row.split("|").map(c => c.trim()).filter((_, cIdx, arr) => cIdx > 0 && cIdx < arr.length - 1);
                                        const isHeader = rIdx === 0;
                                        return (
                                          <tr 
                                            key={rIdx} 
                                            className={isHeader ? "bg-muted/70 font-bold border-b text-foreground" : "border-b border-border/40 hover:bg-muted/20 transition-colors"}
                                          >
                                            {cols.map((col, cIdx) => (
                                              <td key={cIdx} className="py-2 px-3 align-top leading-snug">
                                                {col.includes("⚠️") || col.includes("❌") || col.includes("✅") ? (
                                                  <span className="font-semibold">{col}</span>
                                                ) : (
                                                  col
                                                )}
                                              </td>
                                            ))}
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              );
                            }

                            // Listas con viñetas o números
                            if (trimmed.startsWith("* ") || trimmed.startsWith("- ") || /^\d+\.\s/.test(trimmed)) {
                              const items = trimmed.split("\n").filter(Boolean);
                              return (
                                <ul key={bIdx} className="space-y-1.5 pl-1 my-1">
                                  {items.map((item, iIdx) => {
                                    const cleanText = item.replace(/^[\*\-]\s+/, "").replace(/^\d+\.\s+/, "");
                                    return (
                                      <li key={iIdx} className="flex items-start gap-2 leading-relaxed">
                                        <span className="text-purple-500 font-bold shrink-0 mt-0.5">•</span>
                                        <div>
                                          {cleanText.split(/(\*\*.*?\*\*|`.*?`)/).map((part, pIdx) => {
                                            if (part.startsWith("**") && part.endsWith("**")) {
                                              return <strong key={pIdx} className="font-bold text-foreground">{part.slice(2, -2)}</strong>;
                                            }
                                            if (part.startsWith("`") && part.endsWith("`")) {
                                              return <code key={pIdx} className="px-1 py-0.5 rounded bg-muted font-mono text-[10px] text-purple-600 dark:text-purple-300">{part.slice(1, -1)}</code>;
                                            }
                                            return part;
                                          })}
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                              );
                            }

                            // Párrafos regulares con parseo de negritas e inline code
                            return (
                              <p key={bIdx} className="leading-relaxed">
                                {trimmed.split(/(\*\*.*?\*\*|`.*?`)/).map((part, pIdx) => {
                                  if (part.startsWith("**") && part.endsWith("**")) {
                                    return <strong key={pIdx} className="font-bold text-foreground">{part.slice(2, -2)}</strong>;
                                  }
                                  if (part.startsWith("`") && part.endsWith("`")) {
                                    return <code key={pIdx} className="px-1 py-0.5 rounded bg-muted font-mono text-[10px] text-purple-600 dark:text-purple-300">{part.slice(1, -1)}</code>;
                                  }
                                  return part;
                                })}
                              </p>
                            );
                          })}
                        </div>
                      )}
                      <span className={`block text-[9px] mt-2.5 font-mono ${isUser ? "text-white/75 text-right" : "text-muted-foreground"}`}>
                        {msg.timestamp}
                      </span>
                    </div>
                  </div>
                );
              })}

              {isSending && (
                <div className="flex gap-3 justify-start items-center">
                  <div className="h-7 w-7 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="bg-muted/60 border border-border/80 rounded-xl px-4 py-2.5 text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-600" />
                    <span>Consultando base de datos de TI y procesando diagnóstico...</span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>

          {/* Caja de Input */}
          <CardFooter className="p-3 border-t bg-muted/10 gap-2">
            <Textarea
              placeholder="Escribe una consulta de soporte, audita licencias, equipos, o analiza logs..."
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              className="resize-none text-xs font-mono bg-background"
            />
            <Button
              onClick={() => handleSendMessage()}
              disabled={isSending || !input.trim()}
              className="h-full px-4 bg-purple-600 hover:bg-purple-700 text-white shrink-0"
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
