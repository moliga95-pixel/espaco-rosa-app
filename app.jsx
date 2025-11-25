import React, { useState, useEffect, useReducer, useCallback } from 'react';
import { LogIn, Home, Users, ClipboardList, Package, UserPlus, HeartHandshake, LogOut, Loader2, Save, Trash2, Edit, X, AlertTriangle, Calendar, DollarSign, Wallet, FileText, ArrowRight, TrendingUp, MinusCircle, CheckCircle, Receipt, DollarSign as DollarSignIcon, List, XCircle, Settings, RefreshCw } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, query, onSnapshot, setLogLevel, where, getDoc, runTransaction, getDocs } from 'firebase/firestore';

// Habilita o log de debug do Firestore (útil para desenvolvimento)
setLogLevel('debug'); 

// --- CONFIGURAÇÃO E AUTENTICAÇÃO FIREBASE ---
// Variáveis globais de ambiente (disponíveis no Canvas)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// CORREÇÃO CRÍTICA: Força um objeto de config válido para evitar travamento do React.
const firebaseConfig = typeof __firebase_config !== 'undefined' ? 
  JSON.parse(__firebase_config) : 
  { apiKey: "simulado", projectId: "simulado" }; // <-- LINHA CORRIGIDA

// CORRIGIDO: O initialAuthToken é uma string bruta (JWT), não deve ser parseado como JSON.
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : undefined;

// Estados globais para Firebase/Auth
let db;
let auth;

// --- UTILITÁRIOS ---
const formatCurrency = (value) => {
    const num = Number(value);
    if (isNaN(num)) return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', }).format(0);
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(num);
};
const formatDate = (isoString) => {
    if (!isoString) return '';
    try {
        const datePart = isoString.split('T')[0];
        const [year, month, day] = datePart.split('-');
        return `${day}/${month}/${year}`;
    } catch {
        // Assume YYYY-MM-DD from dueDate
        const [year, month, day] = isoString.split('-');
        if (year && month && day) return `${day}/${month}/${year}`;
        return 'Data Inválida';
    }
};

const getMonthYearString = (date = new Date()) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return `${year}-${String(month).padStart(2, '0')}`;
};
const getMonthYearFromDateString = (dateString) => {
    // Input format YYYY-MM-DD
    if (!dateString) return '';
    const parts = dateString.split('-');
    if (parts.length < 2) return '';
    return `${parts[0]}-${parts[1]}`;
};

// Mapeamento de Mês-Ano para nome (Ex: 2025-12 -> Dezembro/2025)
const formatMonthYearToLabel = (monthYearString) => {
    if (!monthYearString || monthYearString.length < 7) return '';
    const [year, month] = monthYearString.split('-');
    const date = new Date(year, parseInt(month) - 1, 1);
    
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}


// Componente para a Logo Estilizada
const LogoHeader = ({ showAppTitle = true, className = '' }) => (
    <div className={`flex flex-col items-center p-4 bg-white shadow-md ${className}`}>
        <div className="relative flex items-center justify-center w-16 h-16 rounded-full border-2 border-gray-900 bg-white">
            {/* Lótus (Fundo Rosa) */}
            <div className="absolute w-12 h-12 rounded-full bg-[#F06292] opacity-70 transform scale-125"></div>
            {/* 'M' Estilizado em Preto */}
            <span className="absolute text-5xl font-serif font-bold text-gray-900 z-10 -mt-2">M</span>
            {/* Figura Humana (Branco) */}
            <UserPlus className="absolute w-6 h-6 text-white z-20" />
        </div>
        {showAppTitle && (
            <h1 className="text-xl font-semibold mt-2 text-gray-900 tracking-wider">Espaço</h1>
        )}
    </div>
);

// --- MODAL DE CONFIRMAÇÃO GENÉRICO (Substitui window.confirm) ---
const ConfirmationModal = ({ item, type, onConfirm, onCancel }) => {
    const itemName = item.nome || item.clientName || item.procedureName || 'este item';
    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 relative">
                <div className="flex flex-col items-center text-center">
                    <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
                    <h3 className="text-xl font-bold mb-2 text-gray-900">Confirmação de Exclusão</h3>
                    <p className="text-gray-600 mb-6">
                        Você tem certeza que deseja **EXCLUIR** o seguinte {type}:
                        <br/>
                        <span className="font-semibold text-gray-900">"{itemName}"</span>?
                    </p>
                    <p className="text-sm text-red-500 mb-6">Esta ação não pode ser desfeita!</p>
                </div>

                <div className="flex justify-end space-x-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
                    >
                        <Trash2 className="w-4 h-4 inline mr-1" /> Excluir
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- MODAL DE CONFIRMAÇÃO DE CANCELAMENTO DE AGENDAMENTO ---
const CancellationModal = ({ appointment, onConfirm, onCancel }) => {
    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 relative">
                <div className="flex flex-col items-center text-center">
                    <XCircle className="w-12 h-12 text-yellow-500 mb-4" />
                    <h3 className="text-xl font-bold mb-2 text-gray-900">Confirmar Cancelamento</h3>
                    <p className="text-gray-600 mb-6">
                        Você tem certeza que deseja **CANCELAR** o agendamento de:
                        <br/>
                        <span className="font-semibold text-gray-900">"{appointment.clientName}"</span>?
                    </p>
                    <p className="text-sm text-yellow-700 mb-6">O agendamento será marcado como cancelado, mas mantido no histórico.</p>
                </div>

                <div className="flex justify-end space-x-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                    >
                        Voltar
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-yellow-600 hover:bg-yellow-700 transition-colors"
                    >
                        <XCircle className="w-4 h-4 inline mr-1" /> Cancelar Agendamento
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- MODAL PARA PAGAMENTO PARCIAL ---
const PartialPaymentModal = ({ payment, onClose, userId }) => {
    // Inicializa com o valor restante para que o cliente possa pagar tudo de uma vez
    const [paidAmount, setPaidAmount] = useState(payment.remainingValue.toFixed(2));
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    
    const remaining = payment.remainingValue;
    const isFullPayment = parseFloat(paidAmount) >= remaining;
    
    const handlePayment = async (e) => {
        e.preventDefault();
        const paid = parseFloat(paidAmount);

        if (paid <= 0 || isNaN(paid)) {
            setMessage('❌ O valor pago deve ser maior que zero.');
            return;
        }

        // A margem de erro permite pagar 1 ou 2 centavos a mais para arredondamentos
        if (paid > remaining + 0.02) { 
             setMessage(`❌ O valor pago (${formatCurrency(paid)}) não pode ser maior que o saldo devedor (${formatCurrency(remaining)}).`);
            return;
        }

        setLoading(true);
        setMessage('Registrando pagamento...');
        
        try {
            const paymentDocRef = doc(db, `artifacts/${appId}/users/${userId}/pagamentos-parcelas`, payment.id);
            
            let newRemaining = remaining - paid;
            // Se o restante for zero ou muito próximo (<= 2 centavos de erro), marca como pago.
            let newStatus = newRemaining <= 0.02 ? 'pago' : 'pendente'; 
            
            // Garante que o remainingValue seja 0 se foi quitado para fins de filtro
            if (newStatus === 'pago') newRemaining = 0;
            
            // 1. Atualiza o documento original da parcela/entrada
            await updateDoc(paymentDocRef, {
                remainingValue: newRemaining,
                status: newStatus,
                lastPaidAmount: paid,
                lastPaymentDate: new Date().toISOString().substring(0, 10),
            });

            // 2. Registra o pagamento efetuado em um documento separado (para histórico de transações)
            // Esta coleção será usada para o cálculo dos Recebíveis do Mês (Entrada de Caixa Real)
            const transactionCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/transacoes-recebiveis`);
            await addDoc(transactionCollectionRef, {
                originalPaymentId: payment.id,
                clientName: payment.clientName,
                amountPaid: paid,
                datePaid: new Date().toISOString().substring(0, 10),
                isFullPayment: newStatus === 'pago',
                newRemaining: newRemaining,
                monthYear: getMonthYearString() // Mês em que o dinheiro realmente entrou
            });

            setMessage(`✅ ${isFullPayment ? 'Pagamento Total' : 'Pagamento Parcial'} de ${formatCurrency(paid)} registrado!`);
            setTimeout(onClose, 1500);

        } catch (error) {
            console.error("Erro ao registrar pagamento:", error);
            setMessage(`❌ Erro ao salvar: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-800">
                    <X className="w-6 h-6" />
                </button>
                <h3 className="text-xl font-bold mb-4 text-gray-900">Liquidação de Parcela</h3>
                
                <div className="p-3 mb-4 rounded-lg bg-gray-100">
                    <p className="text-sm text-gray-600">Cliente: <span className="font-semibold text-gray-800">{payment.clientName}</span></p>
                    <p className="text-sm text-gray-600">Vencimento: <span className="font-semibold text-gray-800">{formatDate(payment.dueDate)}</span></p>
                    <p className="text-lg font-bold mt-2 text-red-600">Saldo Devedor: {formatCurrency(remaining)}</p>
                </div>
                
                <form onSubmit={handlePayment} className="space-y-4">
                    <div>
                        <label htmlFor="paidAmount" className="block text-sm font-medium text-gray-700">Valor Pago Agora (R$)</label>
                        <input
                            id="paidAmount"
                            type="number"
                            step="0.01"
                            value={paidAmount}
                            onChange={(e) => { setPaidAmount(e.target.value); setMessage(''); }}
                            required
                            className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-green-600 focus:border-green-600 text-gray-900"
                        />
                    </div>

                    <div className={`p-3 rounded-lg text-sm font-medium ${isFullPayment ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {isFullPayment ? (
                            <p>✅ Este valor **quitará** a parcela.</p>
                        ) : (
                            <p>⚠️ Pagamento Parcial. Novo saldo devedor: **{formatCurrency(remaining - parseFloat(paidAmount) || remaining)}**</p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={loading || parseFloat(paidAmount) <= 0 || isNaN(parseFloat(paidAmount)) || parseFloat(paidAmount) > remaining + 0.02}
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition-colors disabled:bg-gray-400"
                    >
                        {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <DollarSignIcon className="w-5 h-5 mr-2" />}
                        {loading ? 'Processando...' : 'Registrar Pagamento'}
                    </button>
                    {message && (
                        <p className={`text-center text-sm font-semibold mt-3 ${message.startsWith('✅') ? 'text-green-600' : 'text-red-600'}`}>
                            {message}
                        </p>
                    )}
                </form>
            </div>
        </div>
    );
};

// --- REDUCER E TELAS (RESTANTE DO CÓDIGO) ---
// O restante do código (Home, Cadastros, Listas, Agendamentos, Despesas, Financeiro e AdminScreen)
// permanece o mesmo que a versão anterior, com as correções de lógica já aplicadas.
// Devido à natureza da sua solicitação, irei incluir a versão completa para garantir a compilação.
// A última versão é a que contém o AdminScreen e o Fix de Pagamento Parcial/Arredondamento.

// --- REDUCER PARA NAVEGAÇÃO E DADOS ---
const initialState = {
    screen: 'login',
    isAuthenticated: false,
    isLoading: true,
    userId: null,
    clients: [], 
    procedures: [], 
    appointments: [], 
    pendingPayments: [], 
    expenses: [], 
    appointmentToFinalize: null, 
};

function appReducer(state, action) {
    switch (action.type) {
        case 'SET_AUTH_READY':
            return { ...state, isLoading: false, isAuthenticated: action.payload.isAuthenticated, userId: action.payload.userId };
        case 'LOGIN_SUCCESS':
            return { ...state, isAuthenticated: true, screen: 'home' };
        case 'LOGOUT':
            return { ...state, isAuthenticated: false, screen: 'login', userId: null, clients: [], procedures: [], appointments: [], pendingPayments: [], expenses: [], appointmentToFinalize: null };
        case 'NAVIGATE':
            return { ...state, screen: action.payload, appointmentToFinalize: null };
        case 'SET_APPOINTMENT_TO_FINALIZE':
             return { ...state, screen: 'finalizar-agendamento', appointmentToFinalize: action.payload };
        case 'SET_CLIENTS':
            return { ...state, clients: action.payload };
        case 'SET_PROCEDURES':
            return { ...state, procedures: action.payload };
        case 'SET_APPOINTMENTS':
            return { ...state, appointments: action.payload };
        case 'SET_PENDING_PAYMENTS':
            return { ...state, pendingPayments: action.payload };
        case 'SET_EXPENSES':
            return { ...state, expenses: action.payload };
        default:
            return state;
    }
}

// 1. Tela de Login (Mantida)
const LoginScreen = ({ dispatch }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = (e) => {
        e.preventDefault();
        const USER = 'rosa';
        const PASS = '123';

        if (username.toLowerCase() === USER && password === PASS) {
            dispatch({ type: 'LOGIN_SUCCESS' });
        } else {
            setError('Usuário ou senha inválidos.');
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-white p-6">
            <LogoHeader showAppTitle={true} className="mb-8" />
            <div className="w-full max-w-xs p-6 bg-gray-50 rounded-xl shadow-lg border border-gray-100">
                <h2 className="text-2xl font-bold text-center mb-6 text-gray-900">Acesso Restrito</h2>
                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Usuário:</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => { setUsername(e.target.value); setError(''); }}
                            className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-[#F06292] focus:border-[#F06292] text-gray-900"
                            placeholder="rosa"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Senha:</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); setError(''); }}
                            className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-[#F06292] focus:border-[#F06292] text-gray-900"
                            placeholder="123"
                        />
                    </div>
                    {error && <p className="text-sm text-red-500 text-center">{error}</p>}
                    <button
                        type="submit"
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 transition-colors"
                    >
                        <LogIn className="w-5 h-5 mr-2" /> Entrar
                    </button>
                </form>
            </div>
            <p className="text-xs text-gray-500 mt-4">Acesso apenas para administradores.</p>
        </div>
    );
};

// 2. Tela Inicial (Home) (Mantida)
const HomeScreen = ({ dispatch, clients, procedures, pendingPayments }) => {
    // Card de navegação genérico
    const NavCard = ({ icon: Icon, title, emoji, screen }) => (
        <button
            onClick={() => dispatch({ type: 'NAVIGATE', payload: screen })}
            className="flex flex-col items-center justify-center p-6 bg-white rounded-xl shadow-md border border-gray-100 transition-all duration-200 hover:shadow-lg hover:bg-pink-50"
        >
            <span className="text-4xl mb-2">{emoji}</span>
            <h3 className="text-lg font-semibold text-gray-800 text-center">{title}</h3>
        </button>
    );
    
    // Contagem simples dos itens para mostrar no dashboard
    const countClients = clients.length;
    const countProcedures = procedures.length;

    // Contagem de pendências (parcelamentos em aberto que não foram pagos)
    const countPending = pendingPayments.filter(p => p.type === 'parcela' && p.remainingValue > 0.01).length;

    return (
        <div className="min-h-screen bg-gray-50 pb-8">
            <LogoHeader className="sticky top-0 z-10" />
            <div className="p-4">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-900">Painel Principal</h2>
                    <button
                        onClick={() => dispatch({ type: 'LOGOUT' })}
                        className="flex items-center text-sm text-gray-600 hover:text-gray-900 p-2 rounded-full transition-colors"
                    >
                        <LogOut className="w-5 h-5 mr-1" /> Sair
                    </button>
                </div>

                {/* Cards de Métricas Rápidas */}
                <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-[#fce4ec] p-4 rounded-xl shadow-inner flex flex-col items-center cursor-pointer hover:shadow-lg transition-shadow" 
                         onClick={() => dispatch({ type: 'NAVIGATE', payload: 'listar-clientes' })}>
                        <Users className="w-6 h-6 text-[#F06292] mb-1" />
                        <span className="text-2xl font-bold text-gray-900">{countClients}</span>
                        <p className="text-sm text-gray-700">Clientes</p>
                    </div>
                    <div className="bg-[#f3e5f5] p-4 rounded-xl shadow-inner flex flex-col items-center cursor-pointer hover:shadow-lg transition-shadow"
                         onClick={() => dispatch({ type: 'NAVIGATE', payload: 'listar-procedimentos' })}>
                        <Package className="w-6 h-6 text-gray-900 mb-1" />
                        <span className="text-2xl font-bold text-gray-900">{countProcedures}</span>
                        <p className="text-sm text-gray-700">Procedimentos</p>
                    </div>
                </div>

                {/* Card de Pendências (Novo Requisito) */}
                <button
                    onClick={() => dispatch({ type: 'NAVIGATE', payload: 'pendencias-recebiveis' })}
                    className={`w-full flex items-center justify-between p-4 mb-8 rounded-xl shadow-md border transition-all duration-200 ${countPending > 0 ? 'bg-yellow-100 border-yellow-300 hover:bg-yellow-200' : 'bg-white border-gray-100 hover:bg-gray-50'}`}
                >
                    <div className="flex items-center">
                        <Wallet className={`w-6 h-6 mr-3 ${countPending > 0 ? 'text-red-500' : 'text-gray-500'}`} />
                        <div className="text-left">
                            <h3 className="text-lg font-semibold text-gray-800">Pendências (Recebíveis)</h3>
                            <p className="text-sm text-gray-600">
                                {countPending > 0 ? (
                                    <span className="font-bold text-red-600">{countPending} Parcela(s) em aberto!</span>
                                ) : (
                                    <span>Nenhum pagamento pendente no momento.</span>
                                )}
                            </p>
                        </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-500 flex-shrink-0" />
                </button>


                <div className="grid grid-cols-2 gap-4">
                    <NavCard
                        title="Cadastro & Listas"
                        emoji="💅"
                        screen="cadastro"
                    />
                    <NavCard
                        title="Agendamentos"
                        emoji="🗓️"
                        screen="agendamentos-menu" // Nova tela de menu
                    />
                    <NavCard
                        title="Financeiro"
                        emoji="💵"
                        screen="financeiro" // Nova tela de dashboard
                    />
                    <NavCard
                        title="Despesas" // Renomeado de "Relatórios"
                        emoji="📉"
                        screen="despesas-menu" // Nova tela de despesas
                    />
                </div>
                
                <div className="mt-8 p-4 bg-white rounded-xl shadow-md border border-gray-100">
                    <h3 className="text-lg font-semibold text-[#F06292] mb-2">Seu Espaço</h3>
                    <p className="text-sm text-gray-600">
                        Bem-vinda(o) à área de gerenciamento do **Espaço**. Use os cards acima para navegar.
                    </p>
                </div>
            </div>
        </div>
    );
};

// 3. Tela de Menu de Cadastro (Mantida)
const RegistrationScreen = ({ dispatch }) => {
    // Card de opção de cadastro
    const NavCard = ({ icon: Icon, title, description, screen }) => (
        <button
            onClick={() => dispatch({ type: 'NAVIGATE', payload: screen })}
            className="flex items-center p-4 w-full bg-white rounded-xl shadow-md border border-gray-100 transition-all duration-200 hover:shadow-lg hover:bg-pink-50 text-left"
        >
            <Icon className="w-8 h-8 text-[#F06292] mr-4 flex-shrink-0" />
            <div>
                <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
                <p className="text-sm text-gray-500 mt-1">{description}</p>
            </div>
        </button>
    );

    return (
        <div className="min-h-screen bg-gray-50 pb-8">
            <LogoHeader showAppTitle={false} className="sticky top-0 z-10" />
            <div className="p-4">
                <button
                    onClick={() => dispatch({ type: 'NAVIGATE', payload: 'home' })}
                    className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
                >
                    <Home className="w-4 h-4 mr-1" /> Voltar para o Início
                </button>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Menu de Cadastro & Listas</h2>

                <div className="space-y-4">
                    <NavCard
                        icon={UserPlus}
                        title="Cadastrar Cliente"
                        description="Adicione novos clientes à sua base de dados."
                        screen="cadastro-cliente"
                    />
                    <NavCard
                        icon={Users}
                        title="Lista de Clientes (CRUD)"
                        description="Visualizar, editar e excluir clientes existentes."
                        screen="listar-clientes"
                    />
                    <NavCard
                        icon={ClipboardList}
                        title="Cadastrar Procedimento"
                        description="Adicione um novo serviço oferecido pelo Espaço."
                        screen="cadastro-procedimento"
                    />
                    <NavCard
                        icon={Package}
                        title="Lista de Procedimentos (CRUD)"
                        description="Visualizar, editar e excluir seus serviços."
                        screen="listar-procedimentos"
                    />
                </div>
            </div>
        </div>
    );
};

// 4. Tela de Cadastro de Clientes (Mantida com correção de disabled)
const ClientRegistrationScreen = ({ dispatch, userId }) => {
    const [clientName, setClientName] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('Salvando cliente...');

        if (!db || !userId) {
            setMessage('Erro: Conexão com o banco de dados não estabelecida.');
            setLoading(false);
            return;
        }

        try {
            // Caminho para dados privados do usuário
            const collectionRef = collection(db, `artifacts/${appId}/users/${userId}/clientes`);
            
            await addDoc(collectionRef, { 
                nome: clientName, 
                telefone: clientPhone, 
                timestamp: new Date().toISOString() 
            });

            setMessage('✅ Cliente cadastrado com sucesso!');
            setClientName('');
            setClientPhone('');
        } catch (error) {
            console.error("Erro ao cadastrar cliente:", error);
            setMessage(`❌ Erro ao salvar: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-8">
            <LogoHeader showAppTitle={false} className="sticky top-0 z-10" />
            <div className="p-4">
                <button
                    onClick={() => dispatch({ type: 'NAVIGATE', payload: 'cadastro' })}
                    className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
                >
                    <Users className="w-4 h-4 mr-1" /> Voltar para Cadastro
                </button>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Cadastro de Clientes</h2>

                <form onSubmit={handleSubmit} className="space-y-6 p-6 bg-white rounded-xl shadow-lg border border-gray-100">
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nome Completo</label>
                        <input
                            id="name"
                            type="text"
                            value={clientName}
                            onChange={(e) => { setClientName(e.target.value); setMessage(''); }}
                            required
                            className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-[#F06292] focus:border-[#F06292] text-gray-900"
                            placeholder="Nome do(a) Cliente"
                        />
                    </div>
                    <div>
                        <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Telefone WhatsApp</label>
                        <input
                            id="phone"
                            type="tel"
                            value={clientPhone}
                            onChange={(e) => { setClientPhone(e.target.value); setMessage(''); }}
                            required
                            className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-[#F06292] focus:border-[#F06292] text-gray-900"
                            placeholder="(99) 99999-9999"
                        />
                        <p className="mt-1 text-xs text-gray-500">Formato: Apenas números é o ideal para salvar.</p>
                    </div>

                    <button
                        type="submit"
                        disabled={!clientName || !clientPhone || loading || !userId} // Correção: Desabilitado se userId não estiver pronto
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-base font-medium text-white bg-[#F06292] hover:bg-pink-700 transition-colors disabled:bg-pink-300"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        ) : (
                            <HeartHandshake className="w-5 h-5 mr-2" />
                        )}
                        {loading ? 'Salvando...' : 'Salvar Cliente'}
                    </button>
                    {message && (
                        <p className={`text-center text-sm font-semibold mt-4 ${message.startsWith('✅') ? 'text-green-600' : message.startsWith('❌') ? 'text-red-600' : 'text-blue-600'}`}>
                            {message}
                        </p>
                    )}
                </form>
            </div>
        </div>
    );
};

// --- MODAIS DE EDIÇÃO ---

// Modal para Edição de Clientes (Mantida)
const ClientEditModal = ({ client, onClose, userId }) => {
    const [name, setName] = useState(client.nome);
    const [phone, setPhone] = useState(client.telefone);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const handleUpdate = async () => {
        setLoading(true);
        setMessage('Atualizando cliente...');
        if (!db || !userId) {
             setMessage('Erro: Conexão com o banco de dados não estabelecida.');
             setLoading(false);
             return;
        }

        try {
            const clientDocRef = doc(db, `artifacts/${appId}/users/${userId}/clientes`, client.id);
            await updateDoc(clientDocRef, {
                nome: name,
                telefone: phone,
                updatedAt: new Date().toISOString()
            });
            setMessage('✅ Cliente atualizado com sucesso!');
            setTimeout(onClose, 1000); // Fecha após sucesso
        } catch (error) {
            console.error("Erro ao atualizar cliente:", error);
            setMessage(`❌ Erro ao atualizar: ${error.message}`);
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-800">
                    <X className="w-6 h-6" />
                </button>
                <h3 className="text-xl font-bold mb-4 text-gray-900">Editar Cliente</h3>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Nome</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => { setName(e.target.value); setMessage(''); }}
                            className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-[#F06292] focus:border-[#F06292]"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Telefone</label>
                        <input
                            type="tel"
                            value={phone}
                            onChange={(e) => { setPhone(e.target.value); setMessage(''); }}
                            className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-[#F06292] focus:border-[#F06292]"
                        />
                    </div>
                </div>

                <button
                    onClick={handleUpdate}
                    disabled={loading || !name || !phone}
                    className="mt-6 w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 transition-colors disabled:bg-gray-400"
                >
                    {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
                    {loading ? 'Salvando...' : 'Salvar Alterações'}
                </button>

                {message && (
                    <p className={`text-center text-sm font-semibold mt-3 ${message.startsWith('✅') ? 'text-green-600' : 'text-red-600'}`}>
                        {message}
                    </p>
                )}
            </div>
        </div>
    );
};

// Modal para Edição de Procedimentos (Mantida)
const ProcedureEditModal = ({ procedure, onClose, userId }) => {
    const [name, setName] = useState(procedure.nome);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const handleUpdate = async () => {
        setLoading(true);
        setMessage('Atualizando procedimento...');
        if (!db || !userId) {
             setMessage('Erro: Conexão com o banco de dados não estabelecida.');
             setLoading(false);
             return;
        }

        try {
            const procDocRef = doc(db, `artifacts/${appId}/users/${userId}/procedimentos`, procedure.id);
            await updateDoc(procDocRef, {
                nome: name,
                updatedAt: new Date().toISOString()
            });
            setMessage('✅ Procedimento atualizado com sucesso!');
            setTimeout(onClose, 1000); // Fech
        } catch (error) {
            console.error("Erro ao atualizar procedimento:", error);
            setMessage(`❌ Erro ao atualizar: ${error.message}`);
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-800">
                    <X className="w-6 h-6" />
                </button>
                <h3 className="text-xl font-bold mb-4 text-gray-900">Editar Procedimento</h3>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Nome do Procedimento</label>
                        <textarea
                            rows="3"
                            value={name}
                            onChange={(e) => { setName(e.target.value); setMessage(''); }}
                            className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-[#F06292] focus:border-[#F06292] resize-none"
                        />
                    </div>
                </div>

                <button
                    onClick={handleUpdate}
                    disabled={loading || !name}
                    className="mt-6 w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 transition-colors disabled:bg-gray-400"
                >
                    {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
                    {loading ? 'Salvando...' : 'Salvar Alterações'}
                </button>

                {message && (
                    <p className={`text-center text-sm font-semibold mt-3 ${message.startsWith('✅') ? 'text-green-600' : 'text-red-600'}`}>
                        {message}
                    </p>
                )}
            </div>
        </div>
    );
};


// 5. Tela de Cadastro de Procedimentos (Mantida)
const ProcedureRegistrationScreen = ({ dispatch, userId }) => {
    const [procedureName, setProcedureName] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('Salvando procedimento...');

        if (!db || !userId) {
            setMessage('Erro: Conexão com o banco de dados não estabelecida.');
            setLoading(false);
            return;
        }

        try {
            // Caminho para dados privados do usuário
            const collectionRef = collection(db, `artifacts/${appId}/users/${userId}/procedimentos`);

            await addDoc(collectionRef, { 
                nome: procedureName, 
                timestamp: new Date().toISOString() 
            });
            
            setMessage('✅ Procedimento cadastrado com sucesso!');
            setProcedureName('');
        } catch (error) {
            console.error("Erro ao cadastrar procedimento:", error);
            setMessage(`❌ Erro ao salvar: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-8">
            <LogoHeader showAppTitle={false} className="sticky top-0 z-10" />
            <div className="p-4">
                <button
                    onClick={() => dispatch({ type: 'NAVIGATE', payload: 'cadastro' })}
                    className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
                >
                    <Package className="w-4 h-4 mr-1" /> Voltar para Cadastro
                </button>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Cadastro de Procedimentos</h2>

                <form onSubmit={handleSubmit} className="space-y-6 p-6 bg-white rounded-xl shadow-lg border border-gray-100">
                    <div>
                        <label htmlFor="procedure" className="block text-sm font-medium text-gray-700">Nome do Procedimento</label>
                        <textarea
                            id="procedure"
                            rows="3"
                            value={procedureName}
                            onChange={(e) => { setProcedureName(e.target.value); setMessage(''); }}
                            required
                            className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-[#F06292] focus:border-[#F06292] text-gray-900 resize-none"
                            placeholder="Ex: Microagulhamento, Design de Sobrancelhas, Limpeza de Pele..."
                        />
                        <p className="mt-1 text-xs text-gray-500">Mantenha o campo libre para digitar o nome de cada procedimento.</p>
                    </div>

                    <button
                        type="submit"
                        disabled={!procedureName || loading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-base font-medium text-white bg-gray-900 hover:bg-gray-800 transition-colors disabled:bg-gray-400"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 mr-2 animate-spin text-white" />
                        ) : (
                            <ClipboardList className="w-5 h-5 mr-2" />
                        )}
                        {loading ? 'Salvando...' : 'Salvar Procedimento'}
                    </button>
                    {message && (
                        <p className={`text-center text-sm font-semibold mt-4 ${message.startsWith('✅') ? 'text-green-600' : message.startsWith('❌') ? 'text-red-600' : 'text-blue-600'}`}>
                            {message}
                        </p>
                    )}
                </form>
            </div>
        </div>
    );
};

// 6. Tela de Listagem de Clientes (CRUD) (Mantida)
const ClientListScreen = ({ dispatch, clients, userId }) => {
    const [clientToEdit, setClientToEdit] = useState(null);
    const [clientToDelete, setClientToDelete] = useState(null); // Item a ser excluído (para o modal)
    const [loadingDeleteId, setLoadingDeleteId] = useState(null);

    const confirmDelete = async () => {
        if (!clientToDelete) return;

        const clientId = clientToDelete.id;
        setLoadingDeleteId(clientId);
        setClientToDelete(null); // Fecha o modal imediatamente

        if (!db || !userId) {
            console.error('Erro: Conexão com o banco de dados não estabelecida.');
            setLoadingDeleteId(null);
            return;
        }

        try {
            await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/clientes`, clientId));
            // O onSnapshot se encarrega de atualizar a lista.
        } catch (error) {
            console.error("Erro ao excluir cliente:", error);
            // Em um app real, você mostraria uma mensagem de erro na tela
        } finally {
            setLoadingDeleteId(null);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-8">
            <LogoHeader showAppTitle={false} className="sticky top-0 z-10" />
            <div className="p-4">
                <button
                    onClick={() => dispatch({ type: 'NAVIGATE', payload: 'cadastro' })}
                    className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
                >
                    <Users className="w-4 h-4 mr-1" /> Voltar para Cadastro
                </button>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Lista de Clientes ({clients.length})</h2>

                {clients.length === 0 ? (
                    <div className="p-6 bg-white rounded-xl shadow-md text-center text-gray-500">
                        Nenhum cliente cadastrado ainda.
                        <button 
                            onClick={() => dispatch({ type: 'NAVIGATE', payload: 'cadastro-cliente' })}
                            className="mt-4 w-full py-2 px-4 border border-transparent rounded-lg text-sm font-medium text-white bg-[#F06292] hover:bg-pink-700 transition-colors"
                        >
                            Cadastrar Novo Cliente
                        </button>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {clients.map(client => (
                            <li key={client.id} className="p-4 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                    <p className="text-lg font-semibold text-gray-900 truncate">{client.nome}</p>
                                    <p className="text-sm text-gray-600">{client.telefone}</p>
                                </div>
                                <div className="flex space-x-2 ml-4 flex-shrink-0">
                                    <button 
                                        onClick={() => setClientToEdit(client)}
                                        className="p-2 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
                                        aria-label="Editar Cliente"
                                    >
                                        <Edit className="w-5 h-5" />
                                    </button>
                                    <button 
                                        onClick={() => setClientToDelete(client)} // Abre o modal
                                        disabled={loadingDeleteId === client.id}
                                        className={`p-2 rounded-full transition-colors ${loadingDeleteId === client.id ? 'bg-red-300' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
                                        aria-label="Excluir Cliente"
                                    >
                                        {loadingDeleteId === client.id ? (
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                        ) : (
                                            <Trash2 className="w-5 h-5" />
                                        )}
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {clientToEdit && (
                <ClientEditModal 
                    client={clientToEdit} 
                    onClose={() => setClientToEdit(null)} 
                    userId={userId} 
                />
            )}
            {clientToDelete && (
                <ConfirmationModal
                    item={clientToDelete}
                    type="cliente"
                    onConfirm={confirmDelete}
                    onCancel={() => setClientToDelete(null)}
                />
            )}
        </div>
    );
};

// 7. Tela de Listagem de Procedimentos (CRUD) (Mantida)
const ProcedureListScreen = ({ dispatch, procedures, userId }) => {
    const [procToEdit, setProcToEdit] = useState(null);
    const [procToDelete, setProcToDelete] = useState(null); // Item a ser excluído (para o modal)
    const [loadingDeleteId, setLoadingDeleteId] = useState(null);

    const confirmDelete = async () => {
        if (!procToDelete) return;

        const procId = procToDelete.id;
        setLoadingDeleteId(procId);
        setProcToDelete(null); // Fecha o modal imediatamente

        if (!db || !userId) {
            console.error('Erro: Conexão com o banco de dados não estabelecida.');
            setLoadingDeleteId(null);
            return;
        }

        try {
            await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/procedimentos`, procId));
            // O onSnapshot se encarrega de atualizar a lista.
        } catch (error) {
            console.error("Erro ao excluir procedimento:", error);
            // Em um app real, você mostraria uma mensagem de erro na tela
        } finally {
            setLoadingDeleteId(null);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-8">
            <LogoHeader showAppTitle={false} className="sticky top-0 z-10" />
            <div className="p-4">
                <button
                    onClick={() => dispatch({ type: 'NAVIGATE', payload: 'cadastro' })}
                    className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
                >
                    <Package className="w-4 h-4 mr-1" /> Voltar para Cadastro
                </button>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Lista de Procedimentos ({procedures.length})</h2>

                {procedures.length === 0 ? (
                    <div className="p-6 bg-white rounded-xl shadow-md text-center text-gray-500">
                        Nenhum procedimento cadastrado ainda.
                        <button 
                            onClick={() => dispatch({ type: 'NAVIGATE', payload: 'cadastro-procedimento' })}
                            className="mt-4 w-full py-2 px-4 border border-transparent rounded-lg text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 transition-colors"
                        >
                            Cadastrar Novo Procedimento
                        </button>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {procedures.map(proc => (
                            <li key={proc.id} className="p-4 bg-white rounded-xl shadow-sm border border-gray-100 flex items-start justify-between">
                                <div className="flex-1 min-w-0 pr-4">
                                    <p className="text-lg font-semibold text-gray-900">{proc.nome}</p>
                                </div>
                                <div className="flex space-x-2 flex-shrink-0">
                                    <button 
                                        onClick={() => setProcToEdit(proc)}
                                        className="p-2 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
                                        aria-label="Editar Procedimento"
                                    >
                                        <Edit className="w-5 h-5" />
                                    </button>
                                    <button 
                                        onClick={() => setProcToDelete(proc)} // Abre o modal
                                        disabled={loadingDeleteId === proc.id}
                                        className={`p-2 rounded-full transition-colors ${loadingDeleteId === proc.id ? 'bg-red-300' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
                                        aria-label="Excluir Procedimento"
                                    >
                                        {loadingDeleteId === proc.id ? (
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                        ) : (
                                            <Trash2 className="w-5 h-5" />
                                        )}
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {procToEdit && (
                <ProcedureEditModal 
                    procedure={procToEdit} 
                    onClose={() => setProcToEdit(null)} 
                    userId={userId} 
                />
            )}
            {procToDelete && (
                <ConfirmationModal
                    item={procToDelete}
                    type="procedimento"
                    onConfirm={confirmDelete}
                    onCancel={() => setProcToDelete(null)}
                />
            )}
        </div>
    );
};

// 8. TELA DE MENU DE AGENDAMENTOS (Novo)
const AppointmentMenuScreen = ({ dispatch }) => {
    return (
        <div className="min-h-screen bg-gray-50 pb-8">
            <LogoHeader showAppTitle={false} className="sticky top-0 z-10" />
            <div className="p-4">
                <button
                    onClick={() => dispatch({ type: 'NAVIGATE', payload: 'home' })}
                    className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
                >
                    <Home className="w-4 h-4 mr-1" /> Voltar para o Início
                </button>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Menu de Agendamentos</h2>

                <div className="space-y-4">
                    <button
                        onClick={() => dispatch({ type: 'NAVIGATE', payload: 'agendar-cliente' })}
                        className="flex items-center p-4 w-full bg-white rounded-xl shadow-md border border-gray-100 transition-all duration-200 hover:shadow-lg hover:bg-pink-50 text-left"
                    >
                        <Calendar className="w-8 h-8 text-[#F06292] mr-4 flex-shrink-0" />
                        <div>
                            <h3 className="text-lg font-semibold text-gray-800">Agendar Cliente</h3>
                            <p className="text-sm text-gray-500 mt-1">Reservar data, hora e procedimento.</p>
                        </div>
                    </button>
                    <button
                        onClick={() => dispatch({ type: 'NAVIGATE', payload: 'agendamentos-lista' })} 
                        className="flex items-center p-4 w-full bg-white rounded-xl shadow-md border border-gray-100 transition-all duration-200 hover:shadow-lg hover:bg-pink-50 text-left"
                    >
                        <ClipboardList className="w-8 h-8 text-gray-900 mr-4 flex-shrink-0" />
                        <div>
                            <h3 className="text-lg font-semibold text-gray-800">Finalizar Agendamentos</h3>
                            <p className="text-sm text-gray-500 mt-1">Ver lista e registrar o pagamento após o serviço.</p>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
};

// 9. TELA DE AGENDAMENTO - AGENDAR (Apenas reserva)
const ScheduleClientScreen = ({ dispatch, clients, procedures, userId }) => {
    // --- Estado do Formulário ---
    const [selectedClient, setSelectedClient] = useState('');
    const [date, setDate] = useState(new Date().toISOString().substring(0, 10)); // Data de hoje em YYYY-MM-DD
    const [startTime, setStartTime] = useState('09:00');
    const [endTime, setEndTime] = useState('10:00');
    const [selectedProcedure, setSelectedProcedure] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);

    const canSubmit = selectedClient && selectedProcedure && date && startTime && endTime;

    // --- Submissão do Formulário ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!canSubmit) {
            setMessage('❌ Preencha todos os campos obrigatórios.');
            return;
        }

        setLoading(true);
        setMessage('Registrando agendamento...');

        if (!db || !userId) {
            setMessage('❌ Erro: Conexão com o banco de dados não estabelecida.');
            setLoading(false);
            return;
        }

        const client = clients.find(c => c.id === selectedClient);
        const procedure = procedures.find(p => p.id === selectedProcedure);

        // 1. Salva o Agendamento (SÓ A RESERVA)
        const appointmentData = {
            clientId: client.id,
            clientName: client.nome,
            procedureId: procedure.id,
            procedureName: procedure.nome,
            date: date,
            startTime: startTime,
            endTime: endTime,
            status: 'agendado', // Status inicial
            timestamp: new Date().toISOString(),
        };

        try {
            const apptCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/agendamentos`);
            await addDoc(apptCollectionRef, appointmentData);
            
            setMessage('✅ Cliente agendado com sucesso! Lembre-se de Finalizar após o serviço.');
            // Resetar formulário
            setSelectedClient('');
            setSelectedProcedure('');
            setDate(new Date().toISOString().substring(0, 10));
            setStartTime('09:00');
            setEndTime('10:00');
            
        } catch (error) {
            console.error("Erro ao registrar agendamento:", error);
            setMessage(`❌ Erro ao salvar: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-8">
            <LogoHeader showAppTitle={false} className="sticky top-0 z-10" />
            <div className="p-4">
                <button
                    onClick={() => dispatch({ type: 'NAVIGATE', payload: 'agendamentos-menu' })}
                    className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
                >
                    <Calendar className="w-4 h-4 mr-1" /> Voltar para Agendamentos
                </button>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Agendar Cliente (Reserva)</h2>

                <form onSubmit={handleSubmit} className="space-y-6 p-6 bg-white rounded-xl shadow-lg border border-gray-100">
                    
                    {/* 1. Cliente */}
                    <div>
                        <label htmlFor="client" className="block text-sm font-medium text-gray-700">Selecione o Cliente</label>
                        <select
                            id="client"
                            value={selectedClient}
                            onChange={(e) => { setSelectedClient(e.target.value); setMessage(''); }}
                            required
                            className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-[#F06292] focus:border-[#F06292] text-gray-900"
                        >
                            <option value="">-- Selecione um Cliente --</option>
                            {clients.map(client => (
                                <option key={client.id} value={client.id}>{client.nome}</option>
                            ))}
                        </select>
                        {clients.length === 0 && <p className="mt-1 text-xs text-red-500">Nenhum cliente cadastrado. <button type="button" onClick={() => dispatch({type: 'NAVIGATE', payload: 'cadastro-cliente'})} className="underline">Clique aqui</button> para cadastrar.</p>}
                    </div>

                    {/* 2. Data e Horário */}
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label htmlFor="date" className="block text-sm font-medium text-gray-700">Data</label>
                            <input
                                id="date"
                                type="date"
                                value={date}
                                onChange={(e) => { setDate(e.target.value); setMessage(''); }}
                                required
                                className="mt-1 block w-full px-2 py-2 border border-gray-300 rounded-lg focus:ring-[#F06292] focus:border-[#F06292] text-gray-900"
                            />
                        </div>
                        <div>
                            <label htmlFor="start" className="block text-sm font-medium text-gray-700">Início</label>
                            <input
                                id="start"
                                type="time"
                                value={startTime}
                                onChange={(e) => { setStartTime(e.target.value); setMessage(''); }}
                                required
                                className="mt-1 block w-full px-2 py-2 border border-gray-300 rounded-lg focus:ring-[#F06292] focus:border-[#F06292] text-gray-900"
                            />
                        </div>
                        <div>
                            <label htmlFor="end" className="block text-sm font-medium text-gray-700">Fim</label>
                            <input
                                id="end"
                                type="time"
                                value={endTime}
                                onChange={(e) => { setEndTime(e.target.value); setMessage(''); }}
                                required
                                className="mt-1 block w-full px-2 py-2 border border-gray-300 rounded-lg focus:ring-[#F06292] focus:border-[#F06292] text-gray-900"
                            />
                        </div>
                    </div>

                    {/* 3. Procedimento */}
                    <div>
                        <label htmlFor="procedure" className="block text-sm font-medium text-gray-700">Procedimento</label>
                        <select
                            id="procedure"
                            value={selectedProcedure}
                            onChange={(e) => { setSelectedProcedure(e.target.value); setMessage(''); }}
                            required
                            className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-[#F06292] focus:border-[#F06292] text-gray-900"
                        >
                            <option value="">-- Selecione um Procedimento --</option>
                            {procedures.map(proc => (
                                <option key={proc.id} value={proc.id}>{proc.nome}</option>
                            ))}
                        </select>
                        {procedures.length === 0 && <p className="mt-1 text-xs text-red-500">Nenhum procedimento cadastrado. <button type="button" onClick={() => dispatch({type: 'NAVIGATE', payload: 'cadastro-procedimento'})} className="underline">Clique aqui</button> para cadastrar.</p>}
                    </div>

                    {/* Botão de Agendar */}
                    <button
                        type="submit"
                        disabled={!canSubmit || loading || clients.length === 0 || procedures.length === 0}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-base font-medium text-white bg-gray-900 hover:bg-gray-800 transition-colors disabled:bg-gray-400"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 mr-2 animate-spin text-white" />
                        ) : (
                            <Calendar className="w-5 h-5 mr-2" />
                        )}
                        {loading ? 'Agendando...' : 'Agendar Cliente'}
                    </button>
                    {message && (
                        <p className={`text-center text-sm font-semibold mt-4 ${message.startsWith('✅') ? 'text-green-600' : message.startsWith('❌') ? 'text-red-600' : 'text-blue-600'}`}>
                            {message}
                        </p>
                    )}
                </form>
            </div>
        </div>
    );
};

// 10. TELA DE FINALIZAÇÃO DE AGENDAMENTO (Nova)
const FinalizeAppointmentScreen = ({ dispatch, appointment, userId }) => {
    // --- Estado do Formulário ---
    const [chargedValue, setChargedValue] = useState(''); // Valor cobrado
    const [paymentType, setPaymentType] = useState('vista'); // 'vista' ou 'parcelado'
    const [entryValue, setEntryValue] = useState(''); // Valor da entrada (se parcelado)
    const [installments, setInstallments] = useState('1'); // Quantidade de parcelas
    const [installmentValue, setInstallmentValue] = useState(''); // Valor das parcelas
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);

    // --- Lógica de Cálculo e Validação ---
    const totalValue = parseFloat(chargedValue) || 0;
    const isParcelado = paymentType === 'parcelado';
    const numInstallments = parseInt(installments) || 0;
    const hasEntry = isParcelado && (parseFloat(entryValue) || 0) > 0;
    
    // Calcula o valor sugerido da parcela (useEffect para manter a UX)
    useEffect(() => {
        if (isParcelado && totalValue > 0 && numInstallments > 0) {
            const entry = parseFloat(entryValue) || 0;
            const remaining = totalValue - entry;
            if (remaining > 0) {
                const suggestedValue = (remaining / numInstallments).toFixed(2);
                setInstallmentValue(suggestedValue);
            }
        }
    }, [chargedValue, entryValue, installments, paymentType, totalValue, isParcelado, numInstallments]);

    const totalCalculated = (parseFloat(entryValue) || 0) + (numInstallments * parseFloat(installmentValue) || 0);

    // CORREÇÃO: Permite uma diferença de até 2 centavos devido a erros de arredondamento em divisão.
    const isTotalMatch = Math.abs(totalCalculated - totalValue) < 0.03; 
    const canSubmit = totalValue > 0 && (!isParcelado || (isParcelado && isTotalMatch));

    // --- Submissão do Formulário ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!canSubmit) {
            // Mensagem de erro mais clara sobre o arredondamento
            if (isParcelado && !isTotalMatch) {
                setMessage(`❌ O valor calculado (${formatCurrency(totalCalculated)}) não bate com o valor cobrado (${formatCurrency(totalValue)}). O erro de arredondamento precisa ser ajustado manualmente nas parcelas.`);
            } else {
                 setMessage('❌ Corrija as informações de pagamento ou preencha o valor cobrado.');
            }
            return;
        }

        setLoading(true);
        setMessage('Finalizando agendamento e registrando pagamentos...');

        if (!db || !userId) {
            setMessage('❌ Erro: Conexão com o banco de dados não estabelecida.');
            setLoading(false);
            return;
        }
        
        try {
            // 1. Atualiza o Agendamento para 'finalizado' e anexa os dados financeiros
            const apptDocRef = doc(db, `artifacts/${appId}/users/${userId}/agendamentos`, appointment.id);
            await updateDoc(apptDocRef, {
                status: 'finalizado',
                chargedValue: totalValue,
                paymentType: paymentType,
                entryValue: hasEntry ? parseFloat(entryValue) : 0,
                installments: isParcelado ? numInstallments : 0,
                installmentValue: isParcelado ? parseFloat(installmentValue) : 0,
                finalizationDate: new Date().toISOString(),
            });

            const paymentsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/pagamentos-parcelas`);
            const finalizationDate = appointment.date; // Usa a data do agendamento como base
            
            // 2. Gerar Pagamentos (Entrada, À Vista ou Parcelas)
            if (paymentType === 'vista') {
                 // Pagamento à vista (total é registrado como pago)
                await addDoc(paymentsCollectionRef, {
                    apptId: appointment.id,
                    clientName: appointment.clientName,
                    type: 'vista',
                    value: totalValue,
                    dueDate: finalizationDate, 
                    status: 'pago', 
                    paymentDate: new Date().toISOString().substring(0, 10),
                    installmentNumber: 1,
                    monthYear: getMonthYearFromDateString(finalizationDate),
                    remainingValue: 0, 
                });

            } else if (isParcelado) {
                
                // A. Entrada (Se houver)
                if (hasEntry) {
                    const entryVal = parseFloat(entryValue);
                    await addDoc(paymentsCollectionRef, {
                        apptId: appointment.id,
                        clientName: appointment.clientName,
                        type: 'entrada',
                        value: entryVal,
                        dueDate: finalizationDate, 
                        status: 'pago', 
                        paymentDate: new Date().toISOString().substring(0, 10),
                        installmentNumber: 0,
                        monthYear: getMonthYearFromDateString(finalizationDate),
                        remainingValue: 0,
                    });
                }
                
                // B. Parcelas Futuras
                if (numInstallments > 0 && parseFloat(installmentValue) > 0) {
                    const today = new Date(finalizationDate);
                    for (let i = 1; i <= numInstallments; i++) {
                        const dueDate = new Date(today);
                        dueDate.setMonth(today.getMonth() + i); 
                        const dueDateString = dueDate.toISOString().substring(0, 10);
                        const installmentVal = parseFloat(installmentValue);
                        
                        await addDoc(paymentsCollectionRef, {
                            apptId: appointment.id,
                            clientName: appointment.clientName,
                            type: 'parcela',
                            value: installmentVal,
                            dueDate: dueDateString, 
                            status: 'pendente', 
                            paymentDate: null,
                            installmentNumber: i,
                            monthYear: getMonthYearFromDateString(dueDateString),
                            remainingValue: installmentVal, // Valor restante é igual ao valor total da parcela
                        });
                    }
                }
            }

            setMessage('✅ Finalizado com sucesso! Registros financeiros criados.');
            setTimeout(() => dispatch({ type: 'NAVIGATE', payload: 'agendamentos-lista' }), 1500);
            
        } catch (error) {
            console.error("Erro ao finalizar agendamento:", error);
            setMessage(`❌ Erro ao salvar: ${error.message}`);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-8">
            <LogoHeader showAppTitle={false} className="sticky top-0 z-10" />
            <div className="p-4">
                <button
                    onClick={() => dispatch({ type: 'NAVIGATE', payload: 'agendamentos-lista' })}
                    className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
                >
                    <ClipboardList className="w-4 h-4 mr-1" /> Voltar para a Lista
                </button>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Finalizar Agendamento</h2>

                {/* Resumo do Agendamento */}
                <div className="p-4 bg-[#fce4ec] rounded-xl shadow-inner mb-6 border border-[#F06292]">
                    <p className="text-lg font-bold text-gray-900">{appointment.clientName}</p>
                    <p className="text-sm text-gray-700">Procedimento: {appointment.procedureName}</p>
                    <p className="text-sm text-gray-700">Data: {formatDate(appointment.date)} ({appointment.startTime} - {appointment.endTime})</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6 p-6 bg-white rounded-xl shadow-lg border border-gray-100">
                    
                    {/* 1. Valor Cobrado */}
                    <div>
                        <label htmlFor="chargedValue" className="block text-sm font-medium text-gray-700">Valor Cobrado (R$)</label>
                        <input
                            id="chargedValue"
                            type="number"
                            step="0.01"
                            value={chargedValue}
                            onChange={(e) => { setChargedValue(e.target.value); setMessage(''); }}
                            required
                            className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-[#F06292] focus:border-[#F06292] text-gray-900"
                            placeholder="Ex: 500.00"
                        />
                    </div>

                    {/* 2. Pagamento */}
                    <div className="border p-4 rounded-xl bg-gray-50 space-y-4">
                        <h3 className="text-md font-semibold text-gray-900">Detalhes do Pagamento</h3>
                        <div className="flex space-x-4">
                            <label className="flex items-center">
                                <input
                                    type="radio"
                                    name="paymentType"
                                    value="vista"
                                    checked={paymentType === 'vista'}
                                    onChange={() => setPaymentType('vista')}
                                    className="text-[#F06292] focus:ring-[#F06292]"
                                />
                                <span className="ml-2 text-sm text-gray-700">À Vista (Pago Total)</span>
                            </label>
                            <label className="flex items-center">
                                <input
                                    type="radio"
                                    name="paymentType"
                                    value="parcelado"
                                    checked={paymentType === 'parcelado'}
                                    onChange={() => setPaymentType('parcelado')}
                                    className="text-[#F06292] focus:ring-[#F06292]"
                                />
                                <span className="ml-2 text-sm text-gray-700">Parcelamento Próprio</span>
                            </label>
                        </div>

                        {isParcelado && (
                            <div className="space-y-4 pt-2">
                                {/* Entrada */}
                                <div>
                                    <label htmlFor="entryValue" className="block text-sm font-medium text-gray-700">Valor da Entrada (R$)</label>
                                    <input
                                        id="entryValue"
                                        type="number"
                                        step="0.01"
                                        value={entryValue}
                                        onChange={(e) => { setEntryValue(e.target.value); setMessage(''); }}
                                        className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-[#F06292] focus:border-[#F06292] text-gray-900"
                                        placeholder="0.00 (Se houver)"
                                    />
                                    <p className="mt-1 text-xs text-gray-500">A entrada é registrada como **PAGA** na data do serviço.</p>
                                </div>
                                {/* Parcelas */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="installments" className="block text-sm font-medium text-gray-700">Qtde. Parcelas (Próximos meses)</label>
                                        <input
                                            id="installments"
                                            type="number"
                                            min="1"
                                            value={installments}
                                            onChange={(e) => { setInstallments(e.target.value); setMessage(''); }}
                                            required
                                            className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-[#F06292] focus:border-[#F06292] text-gray-900"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="installmentValue" className="block text-sm font-medium text-gray-700">Valor de Cada Parcela (R$)</label>
                                        <input
                                            id="installmentValue"
                                            type="number"
                                            step="0.01"
                                            value={installmentValue}
                                            onChange={(e) => { setInstallmentValue(e.target.value); setMessage(''); }}
                                            required
                                            className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-[#F06292] focus:border-[#F06292] text-gray-900"
                                            placeholder="Sugestão Calculada"
                                        />
                                    </div>
                                </div>
                                {/* Resumo da Validação */}
                                <div className={`p-3 rounded-lg text-sm font-medium ${isTotalMatch ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    <p>Total Informado: {formatCurrency(totalValue)}</p>
                                    <p>Total Calculado (Entrada + Parcelas): {formatCurrency(totalCalculated)}</p>
                                    {!isTotalMatch && <p className="mt-1 font-bold">⚠️ O valor calculado ({formatCurrency(totalCalculated)}) não bate com o valor cobrado ({formatCurrency(totalValue)}). **Ajuste os centavos na parcela final.**</p>}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 3. Botão de Conclusão */}
                    <button
                        type="submit"
                        disabled={!canSubmit || loading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-base font-medium text-white bg-gray-900 hover:bg-gray-800 transition-colors disabled:bg-gray-400"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 mr-2 animate-spin text-white" />
                        ) : (
                            <CheckCircle className="w-5 h-5 mr-2" />
                        )}
                        {loading ? 'Finalizando...' : 'Finalizar e Registrar Pagamento'}
                    </button>
                    {message && (
                        <p className={`text-center text-sm font-semibold mt-4 ${message.startsWith('✅') ? 'text-green-600' : message.startsWith('❌') ? 'text-red-600' : 'text-blue-600'}`}>
                            {message}
                        </p>
                    )}
                </form>
            </div>
        </div>
    );
};

// 11. TELA DE LISTA DE AGENDAMENTOS (Nova)
const AppointmentListScreen = ({ dispatch, appointments, userId }) => {
    const [apptToCancel, setApptToCancel] = useState(null); // Novo estado para cancelamento
    
    // Filtra apenas agendamentos que NÃO foram finalizados ou cancelados
    const pendingAppointments = appointments
        .filter(appt => appt.status === 'agendado')
        .sort((a, b) => new Date(a.date + 'T' + a.startTime) - new Date(b.date + 'T' + b.startTime));

    // Agrupa por data
    const appointmentsByDate = pendingAppointments.reduce((acc, appt) => {
        const dateKey = appt.date;
        const list = acc[dateKey] || [];
        list.push(appt);
        acc[dateKey] = list;
        return acc;
    }, {});
    
    // Funções para formatar a data do cabeçalho
    const getHeaderDateLabel = (dateString) => {
        // CORREÇÃO: Usar datas normalizadas para a comparação para evitar erros de fuso horário
        const normalizedToday = new Date().toISOString().substring(0, 10);
        
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const normalizedTomorrow = tomorrow.toISOString().substring(0, 10);
        
        // Compara a string YYYY-MM-DD
        if (dateString === normalizedToday) return `Hoje - ${formatDate(dateString)}`;
        if (dateString === normalizedTomorrow) return `Amanhã - ${formatDate(dateString)}`;
        
        return formatDate(dateString);
    };
    
    // Lógica de Cancelamento
    const handleCancelAppointment = async () => {
        if (!apptToCancel || !userId || !db) return;
        
        try {
            const apptDocRef = doc(db, `artifacts/${appId}/users/${userId}/agendamentos`, apptToCancel.id);
            await updateDoc(apptDocRef, {
                status: 'cancelado',
                cancellationDate: new Date().toISOString(),
            });
            // O onSnapshot se encarrega de remover da lista (pois o filtro não pega 'cancelado')
            setApptToCancel(null); // Fecha o modal
        } catch (error) {
            console.error("Erro ao cancelar agendamento:", error);
            // Em um app real, mostrar uma mensagem de erro ao usuário
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-8">
            <LogoHeader showAppTitle={false} className="sticky top-0 z-10" />
            <div className="p-4">
                <button
                    onClick={() => dispatch({ type: 'NAVIGATE', payload: 'agendamentos-menu' })}
                    className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
                >
                    <Calendar className="w-4 h-4 mr-1" /> Voltar para o Menu
                </button>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Agendamentos Abertos ({pendingAppointments.length})</h2>

                {pendingAppointments.length === 0 ? (
                    <div className="p-6 bg-white rounded-xl shadow-md text-center text-gray-500">
                        Nenhum agendamento pendente para finalizar.
                        <button 
                            onClick={() => dispatch({ type: 'NAVIGATE', payload: 'agendar-cliente' })}
                            className="mt-4 w-full py-2 px-4 border border-transparent rounded-lg text-sm font-medium text-white bg-[#F06292] hover:bg-pink-700 transition-colors"
                        >
                            Agendar Novo Cliente
                        </button>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {Object.keys(appointmentsByDate).map(dateKey => (
                            <div key={dateKey} className="border border-gray-200 rounded-xl overflow-hidden shadow-lg">
                                <h3 className="bg-gray-200 text-gray-800 p-3 text-lg font-bold">
                                    {getHeaderDateLabel(dateKey)}
                                </h3>
                                <ul className="divide-y divide-gray-100 bg-white">
                                    {appointmentsByDate[dateKey].map(appt => (
                                        <li key={appt.id} className="p-4 flex items-center justify-between hover:bg-pink-50 transition-colors">
                                            <div className="flex-1 min-w-0 pr-4">
                                                <p className="text-lg font-semibold text-gray-900 truncate">{appt.clientName}</p>
                                                <p className="text-sm text-gray-600">{appt.startTime} - {appt.endTime}</p>
                                                <p className="text-sm font-medium text-[#F06292] mt-1">{appt.procedureName}</p>
                                            </div>
                                            <div className="flex space-x-2 flex-shrink-0">
                                                {/* NOVO BOTÃO DE CANCELAR */}
                                                <button
                                                    onClick={() => setApptToCancel(appt)}
                                                    className="py-2 px-3 rounded-lg shadow-sm text-sm font-medium transition-colors flex items-center bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                                                    title="Cancelar Agendamento"
                                                >
                                                    <XCircle className="w-4 h-4" />
                                                </button>
                                                
                                                <button
                                                    onClick={() => dispatch({ type: 'SET_APPOINTMENT_TO_FINALIZE', payload: appt })}
                                                    className="py-2 px-4 rounded-lg shadow-sm text-sm font-medium transition-colors flex items-center bg-green-600 text-white hover:bg-green-700"
                                                    title="Finalizar e Registrar Pagamento"
                                                >
                                                    <DollarSign className="w-4 h-4 mr-1" /> Finalizar
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            {apptToCancel && (
                <CancellationModal
                    appointment={apptToCancel}
                    onConfirm={handleCancelAppointment}
                    onCancel={() => setApptToCancel(null)}
                />
            )}
        </div>
    );
};


// 12. TELA DE PENDÊNCIAS / RECEBÍVEIS (Atualizada para Pagamento Parcial)
const PendingPaymentsScreen = ({ dispatch, pendingPayments, userId }) => {
    const [paymentToPay, setPaymentToPay] = useState(null);
    
    // Filtra apenas parcelas pendentes (remainingValue > 0)
    // O valor remainingValue é o que é usado para saber o saldo real
    const pendingInstallments = pendingPayments
        .filter(p => p.type === 'parcela' && p.remainingValue > 0.01) // Maior que 1 centavo
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)); // Ordena por vencimento

    // Agrupa por cliente para visualização
    const paymentsByClient = pendingInstallments.reduce((acc, payment) => {
        const client = acc[payment.clientName] || [];
        client.push(payment);
        acc[payment.clientName] = client;
        return acc;
    }, {});

    return (
        <div className="min-h-screen bg-gray-50 pb-8">
            <LogoHeader showAppTitle={false} className="sticky top-0 z-10" />
            <div className="p-4">
                <button
                    onClick={() => dispatch({ type: 'NAVIGATE', payload: 'home' })}
                    className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
                >
                    <Home className="w-4 h-4 mr-1" /> Voltar para o Início
                </button>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Pendências de Recebíveis ({pendingInstallments.length})</h2>

                {pendingInstallments.length === 0 ? (
                    <div className="p-6 bg-white rounded-xl shadow-md text-center text-gray-500">
                        🎉 Nenhuma parcela em aberto no momento!
                    </div>
                ) : (
                    <div className="space-y-6">
                        {Object.entries(paymentsByClient).map(([clientName, payments]) => (
                            <div key={clientName} className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                                <h3 className="bg-[#F06292] text-white p-3 text-lg font-bold">
                                    {clientName}
                                </h3>
                                <ul className="divide-y divide-gray-100">
                                    {payments.map(payment => (
                                        <li key={payment.id} className="p-4 flex items-center justify-between hover:bg-pink-50 transition-colors">
                                            <div className="flex-1 min-w-0 pr-4">
                                                <p className="text-sm font-semibold text-gray-900">
                                                    Parcela {payment.installmentNumber} / Vencimento: {formatDate(payment.dueDate)}
                                                </p>
                                                <p className="text-lg font-bold text-gray-800 mt-1">Saldo: {formatCurrency(payment.remainingValue)}</p>
                                                {payment.lastPaidAmount > 0 && <p className="text-xs text-gray-500">Último Pgto: {formatCurrency(payment.lastPaidAmount)} em {formatDate(payment.lastPaymentDate)}</p>}
                                            </div>
                                            <button
                                                onClick={() => setPaymentToPay(payment)}
                                                className={`py-2 px-4 rounded-lg shadow-sm text-sm font-medium transition-colors flex items-center bg-green-600 text-white hover:bg-green-700`}
                                            >
                                                <DollarSign className="w-4 h-4 mr-1" /> Pagar
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            {paymentToPay && (
                <PartialPaymentModal
                    payment={paymentToPay}
                    onClose={() => setPaymentToPay(null)}
                    userId={userId}
                />
            )}
        </div>
    );
};

// 13. TELA DE DASHBOARD FINANCEIRO (Mantida com o filtro)
const FinanceScreen = ({ dispatch, pendingPayments, expenses }) => {
    // Estado para o filtro de Mês/Ano
    const [selectedMonthYear, setSelectedMonthYear] = useState(getMonthYearString());
    
    // Gera as opções de Mês/Ano com base nos dados disponíveis e no mês atual
    const getMonthYearOptions = useCallback(() => {
        const uniqueMonthYears = new Set();
        const now = new Date();
        
        // 1. Adiciona o mês atual e os 12 meses anteriores (garante que sempre haverá 1 ano de histórico)
        for (let i = 0; i < 12; i++) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            uniqueMonthYears.add(getMonthYearString(date));
        }
        
        // 2. Adiciona Mês/Ano de TODOS os pagamentos pendentes futuros
        pendingPayments.forEach(p => {
            if (p.dueDate) {
                 const paymentMonthYear = getMonthYearFromDateString(p.dueDate);
                 uniqueMonthYears.add(paymentMonthYear);
            }
            if (p.monthYear) uniqueMonthYears.add(p.monthYear);
        });
        
        // 3. Adiciona Mês/Ano de todas as despesas existentes
        expenses.forEach(e => {
            if (e.monthYear) uniqueMonthYears.add(e.monthYear);
        });

        // Converte para array e ordena do mais recente para o mais antigo
        return Array.from(uniqueMonthYears)
            .filter(my => my.length === 7) // Filtra entradas inválidas
            .sort((a, b) => b.localeCompare(a));
    }, [pendingPayments, expenses]);
    
    const monthYearOptions = getMonthYearOptions();

    // --- Cálculos Financeiros ---
    const calculateMetrics = useCallback((currentMonthYear) => {
        let recebiveisDoMes = 0;
        let parcelamentosEmAbertoDoMes = 0;
        let recebiveisFuturos = 0;
        let despesasDoMes = 0;
        
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowString = tomorrow.toISOString().substring(0, 10);
        
        // 1. Recebíveis
        pendingPayments.forEach(p => {
            
            // A. Recebíveis do Mês Selecionado (Dinheiro que entrou REALMENTE no MÊS)
            // Usamos a coleção de transações/pagamentos parciais para saber o que entrou.
            // Aqui, por simplificação, consideramos que o valor TOTAL da parcela/entrada é "recebido" no mês em que é quitado (status: 'pago').
            // Nota: Uma implementação mais robusta usaria a coleção 'transacoes-recebiveis' para somar o 'amountPaid'.
            
            // Filtra o que foi quitado integralmente no MÊS atual do filtro
            if (p.status === 'pago') {
                const paidMonthYear = getMonthYearFromDateString(p.lastPaymentDate || p.paymentDate || p.dueDate); 
                if (paidMonthYear === currentMonthYear) {
                    recebiveisDoMes += p.value; // Recebível Total
                }
            } 
            // Filtra pagamentos parciais que ocorreram no MÊS atual do filtro
            else if (p.status === 'pendente' && p.lastPaidAmount && p.lastPaymentDate) {
                const lastPaymentMonthYear = getMonthYearFromDateString(p.lastPaymentDate);
                if (lastPaymentMonthYear === currentMonthYear) {
                    // Soma apenas o último valor pago parcial registrado
                    recebiveisDoMes += p.lastPaidAmount;
                }
            }


            // B. Recebíveis Futuros (Apenas se o filtro for o Mês ATUAL)
            if (currentMonthYear === getMonthYearString(now)) {
                // Considera o remainingValue (saldo devedor) de todas as parcelas pendentes futuras
                if (p.status === 'pendente' && (p.remainingValue > 0.01) && p.dueDate >= tomorrowString) {
                    recebiveisFuturos += p.remainingValue || p.value;
                }
            }
            
            // C. Parcelamentos em Aberto do Mês (Vencidos e Pendentes neste Mês)
            const paymentMonthYear = p.monthYear || getMonthYearFromDateString(p.dueDate);
            if (p.status === 'pendente' && paymentMonthYear === currentMonthYear) {
                parcelamentosEmAbertoDoMes += p.remainingValue || p.value;
            }
        });
        
        // 2. Despesas
        expenses.forEach(e => {
            if (e.monthYear === currentMonthYear) {
                // Despesas são sempre lançadas com seu valor total na data de vencimento/mês de vencimento
                despesasDoMes += e.value; 
            }
        });

        // 3. Balanço
        const balancoDoMes = recebiveisDoMes - despesasDoMes;

        return {
            recebiveisDoMes,
            recebiveisFuturos,
            parcelamentosEmAbertoDoMes,
            despesasDoMes,
            balancoDoMes
        };
    }, [pendingPayments, expenses]);
    
    const metrics = calculateMetrics(selectedMonthYear);

    // Card de Métricas
    const MetricCard = ({ icon: Icon, title, value, colorClass, bgColorClass, description }) => (
        <div className={`p-5 rounded-xl shadow-md border ${bgColorClass} flex items-start space-x-4`}>
            <div className={`p-2 rounded-full ${colorClass} bg-opacity-20`}>
                <Icon className={`w-6 h-6 ${colorClass}`} />
            </div>
            <div>
                <p className="text-sm font-medium text-gray-600">{title}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(value)}</p>
                <p className="text-xs text-gray-500 mt-1">{description}</p>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50 pb-8">
            <LogoHeader showAppTitle={false} className="sticky top-0 z-10" />
            <div className="p-4">
                <button
                    onClick={() => dispatch({ type: 'NAVIGATE', payload: 'home' })}
                    className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
                >
                    <Home className="w-4 h-4 mr-1" /> Voltar para o Início
                </button>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Dashboard Financeiro</h2>
                
                {/* FILTRO DE MÊS/ANO */}
                <div className="mb-6 p-4 bg-white rounded-xl shadow-md border border-gray-100">
                    <label htmlFor="monthYearFilter" className="block text-sm font-medium text-gray-700 mb-2">
                        Visualizar Mês:
                    </label>
                    <select
                        id="monthYearFilter"
                        value={selectedMonthYear}
                        onChange={(e) => setSelectedMonthYear(e.target.value)}
                        className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-[#F06292] focus:border-[#F06292] text-gray-900"
                    >
                        {monthYearOptions.map(my => (
                            <option key={my} value={my}>
                                {formatMonthYearToLabel(my)} {my === getMonthYearString() && ' (Atual)'}
                            </option>
                        ))}
                    </select>
                </div>
                {/* FIM FILTRO */}

                <div className="space-y-4">
                    
                    {/* Linha de Destaque - Recebíveis do Mês e Balanço */}
                    <div className="grid grid-cols-2 gap-4">
                        <MetricCard
                            icon={DollarSign}
                            title="Recebíveis do Mês"
                            value={metrics.recebiveisDoMes}
                            colorClass="text-green-600"
                            bgColorClass="bg-green-50 border-green-200"
                            description={`Valores que entraram em ${formatMonthYearToLabel(selectedMonthYear)}.`}
                        />
                         <MetricCard
                            icon={TrendingUp}
                            title="Balanço (Receita - Despesa)"
                            value={metrics.balancoDoMes}
                            colorClass={metrics.balancoDoMes >= 0 ? "text-green-600" : "text-red-600"}
                            bgColorClass="bg-white border-gray-100"
                            description={`Resultado em ${formatMonthYearToLabel(selectedMonthYear)}.`}
                        />
                    </div>

                    {/* Linha de Detalhes - Futuros e Pendentes */}
                    <div className="grid grid-cols-2 gap-4">
                        <MetricCard
                            icon={Wallet}
                            title="Recebíveis Futuros"
                            value={metrics.recebiveisFuturos}
                            colorClass="text-blue-600"
                            bgColorClass="bg-blue-50 border-blue-200"
                            description={selectedMonthYear === getMonthYearString() ? "Soma total dos saldos a vencer (Próximos meses)." : "Apenas disponível para o mês atual."}
                        />
                        <MetricCard
                            icon={AlertTriangle}
                            title="Parcelamentos em Aberto (Mês)"
                            value={metrics.parcelamentosEmAbertoDoMes}
                            colorClass="text-yellow-600"
                            bgColorClass="bg-yellow-50 border-yellow-200"
                            description={`Saldo devedor com vencimento em ${formatMonthYearToLabel(selectedMonthYear)}.`}
                        />
                    </div>
                    
                    {/* Card de Despesas (Implementado, mas precisa de tela de cadastro) */}
                    <MetricCard
                        icon={MinusCircle}
                        title="Despesas Registradas (Mês)"
                        value={metrics.despesasDoMes}
                        colorClass="text-red-600"
                        bgColorClass="bg-red-50 border-red-200"
                        description={`Despesas a pagar em ${formatMonthYearToLabel(selectedMonthYear)}.`}
                    />

                    <div className="mt-6 p-4 bg-white rounded-xl shadow-md border border-gray-100">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Próximos Passos</h3>
                        <p className="text-sm text-gray-600">
                            Use o card **Despesas** para lançar os gastos do mês.
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                            Acesse o card "Pendências (Recebíveis)" na tela inicial para registrar pagamentos parciais das clientes.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};


// 14. TELA DE REGISTRO DE DESPESAS (Novo)
const ExpenseRegistrationScreen = ({ dispatch, userId }) => {
    const [name, setName] = useState('');
    const [value, setValue] = useState('');
    const [paymentType, setPaymentType] = useState('vista'); // vista ou prazo
    const [installments, setInstallments] = useState('1'); // Qtde de parcelas
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);

    const isPrazo = paymentType === 'prazo';
    const numInstallments = parseInt(installments) || 1;
    const totalValue = parseFloat(value) || 0;
    const installmentValue = isPrazo && numInstallments > 0 ? (totalValue / numInstallments) : totalValue;
    
    const canSubmit = name && totalValue > 0 && (!isPrazo || numInstallments > 0);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!canSubmit) {
            setMessage('❌ Preencha todos os campos corretamente.');
            return;
        }

        setLoading(true);
        setMessage('Registrando despesa...');

        if (!db || !userId) {
            setMessage('❌ Erro: Conexão com o banco de dados não estabelecida.');
            setLoading(false);
            return;
        }

        try {
            const expensesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/despesas`);
            
            if (isPrazo && numInstallments > 1) {
                // Despesa Parcelada (lançada nos meses futuros)
                for (let i = 0; i < numInstallments; i++) {
                    const dueDate = new Date();
                    // i=0 é o próximo mês para cartão/boleto, i=1 o subsequente, etc.
                    dueDate.setMonth(dueDate.getMonth() + i + 1); 
                    const dueDateString = dueDate.toISOString().substring(0, 10);

                    await addDoc(expensesCollectionRef, {
                        name: `${name} (P. ${i + 1}/${numInstallments})`,
                        value: parseFloat(installmentValue.toFixed(2)), // Fixa o valor para evitar float issues
                        paymentType: 'prazo-parcela',
                        dueDate: dueDateString,
                        monthYear: getMonthYearFromDateString(dueDateString),
                        status: 'pendente', // Despesa futura é pendente
                        timestamp: new Date().toISOString(),
                    });
                }
                
            } else {
                // À vista (Dinheiro/Pix/Débito) ou A Prazo em 1x (próximo mês)
                const dueDate = new Date();
                
                if (paymentType === 'prazo') {
                    // A prazo em 1x (próximo mês)
                    dueDate.setMonth(dueDate.getMonth() + 1); 
                }
                
                const dueDateString = dueDate.toISOString().substring(0, 10);
                
                await addDoc(expensesCollectionRef, {
                    name: name,
                    value: totalValue,
                    paymentType: paymentType,
                    dueDate: dueDateString,
                    monthYear: getMonthYearFromDateString(dueDateString),
                    status: paymentType === 'vista' ? 'pago' : 'pendente', // À vista já é pago
                    timestamp: new Date().toISOString(),
                });
            }

            setMessage('✅ Despesa(s) registrada(s) com sucesso!');
            // Resetar
            setName('');
            setValue('');
            setPaymentType('vista');
            setInstallments('1');
            
        } catch (error) {
            console.error("Erro ao registrar despesa:", error);
            setMessage(`❌ Erro ao salvar: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };


    return (
        <div className="min-h-screen bg-gray-50 pb-8">
            <LogoHeader showAppTitle={false} className="sticky top-0 z-10" />
            <div className="p-4">
                <button
                    onClick={() => dispatch({ type: 'NAVIGATE', payload: 'despesas-menu' })}
                    className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
                >
                    <Home className="w-4 h-4 mr-1" /> Voltar para Despesas
                </button>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Lançar Despesa</h2>

                <form onSubmit={handleSubmit} className="space-y-6 p-6 bg-white rounded-xl shadow-lg border border-gray-100">
                    
                    {/* Nome da Despesa */}
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nome da Despesa</label>
                        <input
                            id="name"
                            type="text"
                            value={name}
                            onChange={(e) => { setName(e.target.value); setMessage(''); }}
                            required
                            className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-[#F06292] focus:border-[#F06292] text-gray-900"
                            placeholder="Ex: Aluguel, Material, Marketing"
                        />
                    </div>
                    
                    {/* Valor */}
                    <div>
                        <label htmlFor="value" className="block text-sm font-medium text-gray-700">Valor Total (R$)</label>
                        <input
                            id="value"
                            type="number"
                            step="0.01"
                            value={value}
                            onChange={(e) => { setValue(e.target.value); setMessage(''); }}
                            required
                            className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-[#F06292] focus:border-[#F06292] text-gray-900"
                            placeholder="Ex: 150.00"
                        />
                    </div>

                    {/* Forma de Pagamento */}
                    <div className="border p-4 rounded-xl bg-gray-50 space-y-4">
                        <h3 className="text-md font-semibold text-gray-900">Forma de Pagamento</h3>
                        <div className="flex space-x-4">
                            <label className="flex items-center">
                                <input
                                    type="radio"
                                    name="paymentType"
                                    value="vista"
                                    checked={paymentType === 'vista'}
                                    onChange={() => setPaymentType('vista')}
                                    className="text-green-600 focus:ring-green-600"
                                />
                                <span className="ml-2 text-sm text-gray-700">À Vista (Dinheiro/Pix/Débito)</span>
                            </label>
                            <label className="flex items-center">
                                <input
                                    type="radio"
                                    name="paymentType"
                                    value="prazo"
                                    checked={paymentType === 'prazo'}
                                    onChange={() => setPaymentType('prazo')}
                                    className="text-red-600 focus:ring-red-600"
                                />
                                <span className="ml-2 text-sm text-gray-700">A Prazo (Cartão/Boleto/Outros)</span>
                            </label>
                        </div>
                        
                        {isPrazo && (
                            <div className="space-y-2 pt-2">
                                <div>
                                    <label htmlFor="installments" className="block text-sm font-medium text-gray-700">Quantidade de Vezes</label>
                                    <input
                                        id="installments"
                                        type="number"
                                        min="1"
                                        value={installments}
                                        onChange={(e) => { setInstallments(e.target.value); setMessage(''); }}
                                        required
                                        className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-[#F06292] focus:border-[#F06292] text-gray-900"
                                    />
                                </div>
                                <div className="p-3 bg-blue-50 rounded-lg text-sm font-medium text-blue-700">
                                    {numInstallments > 1 ? (
                                        <p>Dividido em {numInstallments}x de {formatCurrency(installmentValue)}. Lançado nos próximos {numInstallments} meses.</p>
                                    ) : (
                                        <p>Lançado integralmente no **próximo mês** (1x).</p>
                                    )}
                                </div>
                            </div>
                        )}
                        {paymentType === 'vista' && (
                            <p className="text-sm text-gray-500">Lançado como despesa no **mês atual**.</p>
                        )}
                    </div>

                    {/* Botão de Lançar */}
                    <button
                        type="submit"
                        disabled={!canSubmit || loading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-base font-medium text-white bg-red-600 hover:bg-red-700 transition-colors disabled:bg-gray-400"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 mr-2 animate-spin text-white" />
                        ) : (
                            <Receipt className="w-5 h-5 mr-2" />
                        )}
                        {loading ? 'Lançando...' : 'Lançar Despesa'}
                    </button>
                    {message && (
                        <p className={`text-center text-sm font-semibold mt-4 ${message.startsWith('✅') ? 'text-green-600' : message.startsWith('❌') ? 'text-red-600' : 'text-blue-600'}`}>
                            {message}
                        </p>
                    )}
                </form>
            </div>
        </div>
    );
};

// 15. TELA DE LISTAGEM DE DESPESAS (Novo Componente)
const ExpenseListScreen = ({ dispatch, expenses, userId }) => {
    // 1. Geração de opções de Mês/Ano (pega todos os meses das despesas)
    const getExpenseMonthYearOptions = useCallback(() => {
        const uniqueMonthYears = new Set();
        const now = new Date();
        
        // Garante que o mês atual e os 12 meses anteriores estejam sempre lá
        for (let i = 0; i < 12; i++) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            uniqueMonthYears.add(getMonthYearString(date));
        }
        
        // Adiciona Mês/Ano de todas as despesas registradas
        expenses.forEach(e => {
            if (e.monthYear) uniqueMonthYears.add(e.monthYear);
        });

        // Converte para array e ordena do mais recente para o mais antigo
        return Array.from(uniqueMonthYears)
            .filter(my => my.length === 7) // Filtra entradas inválidas
            .sort((a, b) => b.localeCompare(a));
    }, [expenses]);
    
    const monthYearOptions = getExpenseMonthYearOptions();
    const [selectedMonthYear, setSelectedMonthYear] = useState(getMonthYearString());

    // 2. Filtragem das despesas
    const filteredExpenses = expenses
        .filter(e => e.monthYear === selectedMonthYear)
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
        
    // 3. Status totals para o cabeçalho
    const totalDespesas = filteredExpenses.reduce((acc, e) => acc + e.value, 0);
    const totalPago = filteredExpenses.filter(e => e.status === 'pago').reduce((acc, e) => acc + e.value, 0);
    const totalPendente = totalDespesas - totalPago;
    
    // 4. Ação de marcar como pago (SIMPLES - para controle visual)
    const handleMarkAsPaid = async (expenseId) => {
        if (!db || !userId) {
            console.error('Erro: Conexão com o banco de dados não estabelecida.');
            return;
        }

        try {
            const expenseDocRef = doc(db, `artifacts/${appId}/users/${userId}/despesas`, expenseId);
            await updateDoc(expenseDocRef, {
                status: 'pago',
                paymentDate: new Date().toISOString().substring(0, 10),
            });
        } catch (error) {
            console.error("Erro ao marcar como pago:", error);
        }
    };
    
    return (
        <div className="min-h-screen bg-gray-50 pb-8">
            <LogoHeader showAppTitle={false} className="sticky top-0 z-10" />
            <div className="p-4">
                <button
                    onClick={() => dispatch({ type: 'NAVIGATE', payload: 'despesas-menu' })}
                    className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
                >
                    <Receipt className="w-4 h-4 mr-1" /> Voltar para o Menu
                </button>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Gerenciar Despesas</h2>

                {/* FILTRO DE MÊS/ANO */}
                <div className="mb-4 p-4 bg-white rounded-xl shadow-md border border-gray-100">
                    <label htmlFor="monthYearFilter" className="block text-sm font-medium text-gray-700 mb-2">
                        Visualizar Mês:
                    </label>
                    <select
                        id="monthYearFilter"
                        value={selectedMonthYear}
                        onChange={(e) => setSelectedMonthYear(e.target.value)}
                        className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-red-600 focus:border-red-600 text-gray-900"
                    >
                        {monthYearOptions.map(my => (
                            <option key={my} value={my}>
                                {formatMonthYearToLabel(my)} {my === getMonthYearString() && ' (Atual)'}
                            </option>
                        ))}
                    </select>
                </div>
                
                {/* Resumo do Mês */}
                <div className="grid grid-cols-3 gap-2 mb-6 text-center">
                    <div className="p-2 bg-gray-200 rounded-lg">
                        <p className="text-xs text-gray-600">Total</p>
                        <p className="font-bold text-sm text-gray-900">{formatCurrency(totalDespesas)}</p>
                    </div>
                    <div className="p-2 bg-red-100 rounded-lg">
                        <p className="text-xs text-gray-600">Pendente</p>
                        <p className="font-bold text-sm text-red-600">{formatCurrency(totalPendente)}</p>
                    </div>
                    <div className="p-2 bg-green-100 rounded-lg">
                        <p className="text-xs text-gray-600">Pago</p>
                        <p className="font-bold text-sm text-green-600">{formatCurrency(totalPago)}</p>
                    </div>
                </div>

                {/* Lista de Despesas */}
                {filteredExpenses.length === 0 ? (
                    <div className="p-6 bg-white rounded-xl shadow-md text-center text-gray-500">
                        Nenhuma despesa lançada para {formatMonthYearToLabel(selectedMonthYear)}.
                        <button 
                            onClick={() => dispatch({ type: 'NAVIGATE', payload: 'lancar-despesa' })}
                            className="mt-4 w-full py-2 px-4 border border-transparent rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
                        >
                            Lançar Nova Despesa
                        </button>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {filteredExpenses.map(expense => (
                            <li 
                                key={expense.id} 
                                className={`p-4 rounded-xl shadow-sm border flex items-center justify-between ${expense.status === 'pago' ? 'bg-green-50 border-green-200' : 'bg-white border-red-200'}`}
                            >
                                <div className="flex-1 min-w-0 pr-4">
                                    <p className="text-lg font-semibold text-gray-900">{expense.name}</p>
                                    <p className="text-sm text-gray-600">Vencimento: {formatDate(expense.dueDate)}</p>
                                    <p className={`text-lg font-bold mt-1 ${expense.status === 'pago' ? 'text-green-700' : 'text-red-600'}`}>
                                        {formatCurrency(expense.value)}
                                    </p>
                                </div>
                                <div className="flex-shrink-0">
                                    {expense.status === 'pago' ? (
                                        <span className="py-1 px-3 rounded-full text-xs font-bold bg-green-600 text-white flex items-center">
                                            <CheckCircle className="w-4 h-4 mr-1" /> PAGO
                                        </span>
                                    ) : (
                                        <button
                                            onClick={() => handleMarkAsPaid(expense.id)}
                                            className="py-2 px-4 rounded-lg shadow-sm text-sm font-medium transition-colors flex items-center bg-red-600 text-white hover:bg-red-700"
                                            disabled={false} 
                                        >
                                            <CheckCircle className="w-4 h-4 mr-1" /> Marcar Pago
                                        </button>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};


// 16. Placeholder para Lista de Despesas (Menu)
const ExpenseMenuScreen = ({ dispatch, expenses }) => {
    return (
        <div className="min-h-screen bg-gray-50 pb-8">
            <LogoHeader showAppTitle={false} className="sticky top-0 z-10" />
            <div className="p-4">
                <button
                    onClick={() => dispatch({ type: 'NAVIGATE', payload: 'home' })}
                    className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
                >
                    <Home className="w-4 h-4 mr-1" /> Voltar para o Início
                </button>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Menu de Despesas</h2>

                <div className="space-y-4">
                    <button
                        onClick={() => dispatch({ type: 'NAVIGATE', payload: 'lancar-despesa' })}
                        className="flex items-center p-4 w-full bg-white rounded-xl shadow-md border border-gray-100 transition-all duration-200 hover:shadow-lg hover:bg-pink-50 text-left"
                    >
                        <Receipt className="w-8 h-8 text-red-600 mr-4 flex-shrink-0" />
                        <div>
                            <h3 className="text-lg font-semibold text-gray-800">Lançar Nova Despesa</h3>
                            <p className="text-sm text-gray-500 mt-1">Registrar gastos à vista ou parcelados.</p>
                        </div>
                    </button>
                    <button
                        onClick={() => dispatch({ type: 'NAVIGATE', payload: 'listar-despesas' })}
                        className="flex items-center p-4 w-full bg-white rounded-xl shadow-md border border-gray-100 transition-all duration-200 hover:shadow-lg hover:bg-pink-50 text-left"
                    >
                        <List className="w-8 h-8 text-gray-900 mr-4 flex-shrink-0" />
                        <div>
                            <h3 className="text-lg font-semibold text-gray-800">Listar / Gerenciar Despesas</h3>
                            <p className="text-sm text-gray-500 mt-1">Visualizar, filtrar e marcar despesas como pagas.</p>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
};

// 17. TELA DE ADMINISTRAÇÃO (Limpeza de Dados)
const AdminScreen = ({ dispatch, userId }) => {
    const [status, setStatus] = useState('');
    const [loading, setLoading] = useState(false);

    const collectionsToClear = [
        'clientes', 
        'procedimentos', 
        'agendamentos', 
        'pagamentos-parcelas', 
        'despesas',
        'transacoes-recebiveis'
    ];

    const handleClearData = async () => {
        if (!confirm('ATENÇÃO: Você tem certeza que deseja LIMPAR TODOS OS DADOS? Esta ação é IRREVERSÍVEL!')) {
            return;
        }

        setLoading(true);
        setStatus('Iniciando limpeza...');

        if (!db || !userId) {
            setStatus('Erro: Conexão ou usuário não estabelecido.');
            setLoading(false);
            return;
        }

        try {
            for (const collectionName of collectionsToClear) {
                setStatus(`Limpando coleção: ${collectionName}...`);
                const collectionRef = collection(db, `artifacts/${appId}/users/${userId}/${collectionName}`);
                const snapshot = await getDocs(collectionRef);
                
                const deletePromises = snapshot.docs.map(docSnapshot => {
                    return deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/${collectionName}`, docSnapshot.id));
                });

                await Promise.all(deletePromises);
            }

            setStatus('✅ Limpeza completa! O aplicativo será reiniciado.');
            setTimeout(() => {
                dispatch({ type: 'LOGOUT' }); // Força logout e recarrega para limpar o estado local
                window.location.reload(); 
            }, 1000);
            
        } catch (error) {
            console.error("Erro durante a limpeza de dados:", error);
            setStatus(`❌ Erro ao limpar dados: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-8">
            <LogoHeader showAppTitle={false} className="sticky top-0 z-10" />
            <div className="p-4">
                <h2 className="text-2xl font-bold text-red-600 mb-6">Área Administrativa (Limpeza)</h2>

                <div className="p-6 bg-red-50 rounded-xl shadow-lg border border-red-300 space-y-4">
                    <p className="text-lg font-bold text-red-800 flex items-center">
                        <AlertTriangle className="w-6 h-6 mr-2" /> DANGER ZONE
                    </p>
                    <p className="text-sm text-red-700">
                        Este botão irá **apagar permanentemente** todos os seus dados de clientes, procedimentos, agendamentos, pagamentos e despesas.
                    </p>
                    <p className="text-sm font-semibold text-red-800">
                        USE SOMENTE PARA DEMONSTRAÇÃO OU REINICIALIZAÇÃO TOTAL.
                    </p>
                    
                    <button
                        onClick={handleClearData}
                        disabled={loading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-base font-medium text-white bg-red-700 hover:bg-red-800 transition-colors disabled:bg-gray-400"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        ) : (
                            <Trash2 className="w-5 h-5 mr-2" />
                        )}
                        {loading ? status : 'LIMPAR TODOS OS DADOS (IRREVERSÍVEL)'}
                    </button>
                    {status && status.startsWith('❌') && (
                        <p className="text-center text-sm text-red-600 font-semibold">{status}</p>
                    )}
                </div>
            </div>
        </div>
    );
};


// --- COMPONENTE PRINCIPAL APP ---
function App() {
    const [state, dispatch] = useReducer(appReducer, initialState);
    
    // 1. Inicialização do Firebase e Autenticação
    useEffect(() => {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        const signIn = async () => {
            try {
                if (initialAuthToken) {
                    await signInWithCustomToken(auth, initialAuthToken);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (error) {
                console.error("Erro durante a autenticação Firebase:", error);
                // Mesmo com erro, tentamos continuar para que o usuário possa interagir com o mock.
                dispatch({ type: 'SET_AUTH_READY', payload: { isAuthenticated: false, userId: null } });
            }
        };

        signIn();

        // Listener de estado de autenticação para definir o estado do App
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                // Se já estiver logado (rosa/123), mantém o estado isAuthenticated = true
                dispatch({ type: 'SET_AUTH_READY', payload: { isAuthenticated: state.isAuthenticated || !!user, userId: user.uid } });
                console.log("Usuário Firebase ID:", user.uid);
            } else {
                dispatch({ type: 'SET_AUTH_READY', payload: { isAuthenticated: state.isAuthenticated, userId: null } });
            }
        });
        
        return () => unsubscribe();
    }, []);

    // 2. Carregamento de Dados do Firestore (Clientes, Procedimentos, Agendamentos, Pagamentos, Despesas)
    useEffect(() => {
        if (!state.userId || !state.isAuthenticated || !db) return;

        console.log("Iniciando listener do Firestore para dados...");

        // Clientes
        const unsubscribeClients = onSnapshot(
            collection(db, `artifacts/${appId}/users/${state.userId}/clientes`), 
            (snapshot) => {
                const clientsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                dispatch({ type: 'SET_CLIENTS', payload: clientsData });
            },
            (error) => { console.error("Erro ao buscar clientes:", error); }
        );

        // Procedimentos
        const unsubscribeProcedures = onSnapshot(
            collection(db, `artifacts/${appId}/users/${state.userId}/procedimentos`), 
            (snapshot) => {
                const proceduresData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                dispatch({ type: 'SET_PROCEDURES', payload: proceduresData });
            },
            (error) => { console.error("Erro ao buscar procedimentos:", error); }
        );

        // Agendamentos (Principalmente para referência)
        const apptsCollectionRef = collection(db, `artifacts/${appId}/users/${state.userId}/agendamentos`);
        const unsubscribeAppointments = onSnapshot(
            apptsCollectionRef, 
            (snapshot) => {
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                dispatch({ type: 'SET_APPOINTMENTS', payload: data });
            },
            (error) => { console.error("Erro ao buscar agendamentos:", error); }
        );

        // Pagamentos/Parcelas (Crucial para o Financeiro/Pendências)
        const paymentsCollectionRef = collection(db, `artifacts/${appId}/users/${state.userId}/pagamentos-parcelas`);
        const unsubscribePayments = onSnapshot(
            paymentsCollectionRef, 
            (snapshot) => {
                // Adiciona 'remainingValue' se não existir para retrocompatibilidade
                const data = snapshot.docs.map(doc => {
                    const data = doc.data();
                    if (typeof data.remainingValue === 'undefined' && data.value) {
                         data.remainingValue = data.value;
                    } else if (typeof data.remainingValue === 'undefined') {
                        data.remainingValue = 0;
                    }
                    if (data.status === 'pago') data.remainingValue = 0;
                    return { id: doc.id, ...data };
                });
                dispatch({ type: 'SET_PENDING_PAYMENTS', payload: data });
            },
            (error) => { console.error("Erro ao buscar pagamentos/parcelas:", error); }
        );

        // Despesas (Futuro)
        const expensesCollectionRef = collection(db, `artifacts/${appId}/users/${state.userId}/despesas`);
        const unsubscribeExpenses = onSnapshot(
            expensesCollectionRef, 
            (snapshot) => {
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                dispatch({ type: 'SET_EXPENSES', payload: data });
            },
            (error) => { console.error("Erro ao buscar despesas:", error); }
        );

        return () => {
            unsubscribeClients();
            unsubscribeProcedures();
            unsubscribeAppointments();
            unsubscribePayments();
            unsubscribeExpenses();
        };
    }, [state.userId, state.isAuthenticated]);

    // 3. Renderização de Tela
    const renderScreen = () => {
        // Roteamento administrativo para limpeza de dados
        if (window.location.search.includes('screen=admin')) {
            if (!state.isAuthenticated) return <LoginScreen dispatch={dispatch} />;
            return <AdminScreen dispatch={dispatch} userId={state.userId} />;
        }

        if (state.isLoading) {
            return (
                <div className="flex flex-col items-center justify-center min-h-screen bg-white text-gray-900">
                    <Loader2 className="w-8 h-8 animate-spin text-[#F06292] mb-3" />
                    <p>Carregando App...</p>
                </div>
            );
        }

        if (!state.isAuthenticated) {
            return <LoginScreen dispatch={dispatch} />;
        }

        switch (state.screen) {
            case 'home':
                return <HomeScreen dispatch={dispatch} clients={state.clients} procedures={state.procedures} pendingPayments={state.pendingPayments} />;
            case 'cadastro':
                return <RegistrationScreen dispatch={dispatch} />;
            case 'cadastro-cliente':
                return <ClientRegistrationScreen dispatch={dispatch} userId={state.userId} />;
            case 'listar-clientes':
                return <ClientListScreen dispatch={dispatch} clients={state.clients} userId={state.userId} />;
            case 'cadastro-procedimento':
                return <ProcedureRegistrationScreen dispatch={dispatch} userId={state.userId} />;
            case 'listar-procedimentos':
                return <ProcedureListScreen dispatch={dispatch} procedures={state.procedures} userId={state.userId} />;
            case 'agendamentos-menu':
                return <AppointmentMenuScreen dispatch={dispatch} />;
            case 'agendar-cliente':
                return <ScheduleClientScreen dispatch={dispatch} clients={state.clients} procedures={state.procedures} userId={state.userId} />;
            case 'agendamentos-lista':
                // Nova tela de listagem de agendamentos pendentes
                return <AppointmentListScreen dispatch={dispatch} appointments={state.appointments} userId={state.userId} />;
            case 'finalizar-agendamento':
                // Nova tela de finalização
                return <FinalizeAppointmentScreen dispatch={dispatch} appointment={state.appointmentToFinalize} userId={state.userId} />;
            case 'financeiro':
                return <FinanceScreen dispatch={dispatch} pendingPayments={state.pendingPayments} expenses={state.expenses} />;
            case 'pendencias-recebiveis':
                return <PendingPaymentsScreen dispatch={dispatch} pendingPayments={state.pendingPayments} userId={state.userId} />;
            case 'despesas-menu':
                return <ExpenseMenuScreen dispatch={dispatch} expenses={state.expenses} />;
            case 'lancar-despesa':
                return <ExpenseRegistrationScreen dispatch={dispatch} userId={state.userId} />;
            case 'listar-despesas':
                return <ExpenseListScreen dispatch={dispatch} expenses={state.expenses} userId={state.userId} />;
            default:
                return <HomeScreen dispatch={dispatch} clients={state.clients} procedures={state.procedures} pendingPayments={state.pendingPayments} />;
        }
    };

    // 4. Estrutura Principal do App (Design Responsivo Mobile)
    return (
        <div className="min-h-screen bg-gray-100 flex justify-center">
            {/* O app é contido em um max-w-md para simular a tela de um celular */}
            <div className="w-full max-w-md shadow-2xl bg-white">
                {renderScreen()}
            </div>
        </div>
    );
}
// Removemos o 'export default' duplicado e o colocamos aqui para compilação correta.
export default App;