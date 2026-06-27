"use client";

import { useState, useRef, useEffect } from 'react';

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hola. Estoy aquí para ayudarte a buscar a tus seres queridos o responder tus dudas. ¿A quién buscas hoy?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content }))
        })
      });

      if (!response.ok) {
        throw new Error("API responded with error");
      }

      const data = await response.json();
      setMessages(prev => [...prev, data]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Lo siento, estoy teniendo problemas de conexión. Por favor, intenta de nuevo en unos momentos.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:scale-110 transition-transform flex items-center justify-center text-white z-50 group p-1"
          aria-label="Abrir asistente"
        >
          <img src="/bot-icon.png" alt="Asistente Bot" className="w-full h-full object-cover rounded-full group-hover:animate-pulse" />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-96 max-w-[calc(100vw-3rem)] h-[600px] max-h-[calc(100vh-6rem)] bg-neutral-900/95 backdrop-blur-xl border border-neutral-700/50 rounded-2xl shadow-2xl flex flex-col z-50 animate-in slide-in-from-bottom-5">
          {/* Header */}
          <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-t-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center border border-blue-500/30 overflow-hidden">
                <img src="/bot-icon.png" alt="Asistente Bot" className="w-full h-full object-cover" />
              </div>
              <div>
                <h3 className="font-bold text-white leading-tight">Asistente Solidario</h3>
                <p className="text-xs text-blue-300/80">En línea</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-neutral-400 hover:text-white p-2 rounded-lg hover:bg-neutral-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-bl-none'}`}>
                  {msg.content}
                </div>
                
                {/* Render Result Cards if any */}
                {msg.rawSearchResults && msg.rawSearchResults.length > 0 && (
                  <div className="w-full mt-3 space-y-3">
                    {msg.rawSearchResults.map((person, pIdx) => {
                      const sourcesArray = person.sources || [{name: person.source, url: person.sourceUrl}];
                      const shareText = encodeURIComponent(`🚨 PERSONA LOCALIZADA\nNombre: ${person.nombre} ${person.apellido}\nCédula: ${person.cedula}\nUbicación: ${person.centro}\n${person.edad_sector ? `Sector/Nota: ${person.edad_sector}\n` : ''}${person.estado ? `Estado: ${person.estado}\n` : ''}Reportado en ${sourcesArray.length} plataforma(s).`);
                      
                      return (
                        <div key={pIdx} className="bg-neutral-800/80 border border-neutral-700 rounded-xl p-3 w-full animate-in fade-in">
                           <h4 className="font-bold text-white text-sm">{person.nombre} {person.apellido}</h4>
                           <p className="text-neutral-400 text-xs mt-1">CI: {person.cedula}</p>
                           <p className="text-blue-400 font-medium text-xs mt-1">📍 {person.centro}</p>
                           {person.estado && <p className="text-orange-400 font-medium text-xs mt-1">📋 {person.estado}</p>}
                           
                           <div className="flex flex-wrap gap-1 mt-2">
                            {sourcesArray.map((src, sIdx) => (
                                <span key={sIdx} className="text-[9px] bg-neutral-900 text-neutral-300 px-1.5 py-0.5 rounded border border-neutral-700">
                                    {src.name}
                                </span>
                            ))}
                           </div>
                           
                           <div className="flex gap-2 mt-3">
                              <a
                                href={`https://wa.me/?text=${shareText}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 bg-[#25D366] hover:bg-[#20bd5a] text-white px-2 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors"
                              >
                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                Enviar
                              </a>
                              <a
                                href={`https://t.me/share/url?url=${encodeURIComponent('https://hospitalesenvenezuela.com/')}&text=${shareText}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 bg-[#229ED9] hover:bg-[#1f8ec4] text-white px-2 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors"
                              >
                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M22.05 1.577L.85 9.853c-.902.368-.893.864-.165 1.085l5.44 1.7 12.607-7.95c.594-.361 1.139-.168.685.234l-10.216 9.223-1.07 3.394c.321.096.52.073.714-.117l2.138-2.073 4.453 3.291c.82.454 1.41.22 1.616-.763l2.92-13.766c.265-1.066-.395-1.547-1.12-1.258z"/></svg>
                                Enviar
                              </a>
                           </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="flex items-start">
                <div className="bg-neutral-800 border border-neutral-700 text-neutral-400 rounded-2xl rounded-bl-none px-4 py-3 text-sm flex gap-1">
                  <span className="w-2 h-2 bg-neutral-500 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></span>
                  <span className="w-2 h-2 bg-neutral-500 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></span>
                  <span className="w-2 h-2 bg-neutral-500 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 border-t border-neutral-800 bg-neutral-900 rounded-b-2xl">
            <form onSubmit={sendMessage} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Escribe el nombre aquí..."
                className="flex-1 bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors placeholder-neutral-500"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
              >
                <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
