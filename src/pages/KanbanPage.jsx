"use client"

import { useState, useEffect, useMemo } from "react"
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd"
import { db } from "../firebase"
import { collection, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, deleteDoc, Timestamp, writeBatch } from "firebase/firestore"
import { useAuth } from "../contexts/AuthContext"
import { useUsers } from "../contexts/UserContext"
import { PlusCircle, Pencil, Trash2, AlertCircle, Calendar, Clock, CalendarPlus } from "lucide-react"
import AddTaskModal from "../components/AddTaskModal"
import EditTaskModal from "../components/EditTaskModal"
import toast from "react-hot-toast"

const initialColumns = {
  todo: {
    id: "todo",
    title: "A Fazer",
    taskIds: [],
    headerColor: "bg-blue-500",
    borderColor: "border-blue-500",
  },
  inprogress: {
    id: "inprogress",
    title: "Em Progresso",
    taskIds: [],
    headerColor: "bg-yellow-500",
    borderColor: "border-yellow-500",
  },
  done: {
    id: "done",
    title: "Feito",
    taskIds: [],
    headerColor: "bg-green-500",
    borderColor: "border-green-500",
  },
}

const columnOrder = ["todo", "inprogress", "done"]

// Calcula a diferença de dias úteis (Seg-Sáb) entre duas datas
const getBusinessDays = (startDate, endDate) => {
    let count = 0;
    const curDate = new Date(startDate.getTime());
    while (curDate <= endDate) {
        const dayOfWeek = curDate.getDay();
        if (dayOfWeek !== 0) count++; // 0 é Domingo
        curDate.setDate(curDate.getDate() + 1);
    }
    return count;
};

// Componente de tarefa separado para gerir o seu próprio estado
const TaskCard = ({ task, column, index, userProfile, canEditOrDelete, canDrag, onEdit, onDelete, isSelected, onSelect }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const toggleDescription = (e) => {
        e.stopPropagation();
        setIsExpanded(!isExpanded);
    };

    const description = task.description || '';
    const isLongDescription = description.length > 100;

    // Lógica de feedback visual
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let isOverdue = false;
    if (task.dueDate && task.dueDate.toDate) {
        const dueDate = task.dueDate.toDate();
        dueDate.setHours(0, 0, 0, 0);
        isOverdue = today > dueDate && task.status !== 'done';
    }

    let daysStuck = 0;
    if (task.movedAt && task.movedAt.toDate && task.status !== 'done') {
        const movedDate = task.movedAt.toDate();
        daysStuck = getBusinessDays(movedDate, today);
    }
    const isStuck = daysStuck > 3;

    return (
        <Draggable
            key={task.id}
            draggableId={task.id}
            index={index}
            isDragDisabled={!canDrag}
        >
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className={`bg-white p-4 mb-3 rounded-lg shadow border-l-4 ${
                      isOverdue || isStuck ? 'border-red-500' : column.borderColor
                    } ${
                      snapshot.isDragging ? "shadow-xl scale-105 rotate-2" : "shadow-sm hover:shadow-md"
                    } ${
                      !canDrag
                        ? "opacity-60 cursor-not-allowed"
                        : "cursor-grab hover:cursor-grabbing"
                    } transition-all duration-200`}
                >
                    <div className="flex justify-between items-start">
                        <div className="flex items-start gap-3 w-full">
                            {column.id === 'done' && canEditOrDelete && (
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => onSelect(task.id)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                            )}
                            <div className="flex-grow">
                                <h4 className="font-semibold text-gray-900 mb-2 leading-tight">{task.title}</h4>
                                {description && (
                                    <div className="text-sm text-gray-600 mb-2">
                                        <p style={{ whiteSpace: 'pre-wrap' }}>
                                            {isExpanded ? description : `${description.substring(0, 100)}${isLongDescription ? '...' : ''}`}
                                        </p>
                                        {isLongDescription && (
                                            <button
                                                onClick={toggleDescription}
                                                className="text-blue-600 hover:underline text-xs mt-1"
                                            >
                                                {isExpanded ? 'Ler menos' : 'Ler mais'}
                                            </button>
                                        )}
                                    </div>
                                )}
                                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-x-4 gap-y-1 mt-2 text-xs">
                                    <p className="text-gray-500">
                                        <span className="font-medium">Responsável:</span> {task.assigneeName}
                                    </p>
                                    {task.createdAt && task.createdAt.toDate && (
                                        <div className="flex items-center gap-1 text-gray-500">
                                            <CalendarPlus size={12} />
                                            <span>Criado em: {task.createdAt.toDate().toLocaleDateString('pt-BR')}</span>
                                        </div>
                                    )}
                                    {task.dueDate && task.dueDate.toDate && (
                                        <div className={`flex items-center gap-1 ${isOverdue ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                                            <Calendar size={12}/>
                                            <span>Prazo: {task.dueDate.toDate().toLocaleDateString('pt-BR')}</span>
                                        </div>
                                    )}
                                </div>
                                {isStuck && (
                                    <div className="mt-2 flex items-center gap-1 text-xs text-red-600 font-semibold p-1 bg-red-100 rounded">
                                        <Clock size={12}/>
                                        <span>Parada há {daysStuck} dias úteis</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        {canEditOrDelete && (
                            <div className="flex items-center space-x-1 ml-2">
                                <button
                                    onClick={(e) => { e.stopPropagation(); onEdit(task); }}
                                    className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors duration-200"
                                    aria-label="Editar tarefa"
                                >
                                    <Pencil size={14} />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
                                    className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors duration-200"
                                    aria-label="Deletar tarefa"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </Draggable>
    );
};


function KanbanPage() {
  const [columns, setColumns] = useState(initialColumns)
  const [tasks, setTasks] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { userProfile } = useAuth()
  const { users } = useUsers()

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [taskToEdit, setTaskToEdit] = useState(null)
  const [selectedTasks, setSelectedTasks] = useState(new Set());

  const canAddTasks = useMemo(() => {
    return userProfile && ["coordenador", "diretor", "professor", "professor_apoio", "auxiliar_coordenacao"].includes(userProfile.role)
  }, [userProfile])

  const assignableUsers = useMemo(() => {
    if (!userProfile) return [];
    if (["coordenador", "diretor"].includes(userProfile.role)) {
      return users;
    }
    return [{ id: userProfile.id, name: userProfile.name }];
  }, [userProfile, users]);


  useEffect(() => {
    if (!userProfile) {
      setLoading(false)
      setError("Utilizador não autenticado")
      return
    }

    setLoading(true)
    setError(null)

    const tasksCollectionRef = collection(db, "tasks")

    const unsubscribe = onSnapshot(
      tasksCollectionRef,
      (querySnapshot) => {
        try {
          const allTasks = {}
          const newColumns = JSON.parse(JSON.stringify(initialColumns))

          querySnapshot.forEach((doc) => {
            const taskData = { id: doc.id, ...doc.data() }
            allTasks[taskData.id] = taskData

            if (newColumns[taskData.status]) {
              newColumns[taskData.status].taskIds.push(taskData.id)
            }
          })

          setTasks(allTasks)
          setColumns(newColumns)
          setLoading(false)
          setError(null)
        } catch (err) {
          console.error("Erro ao processar tarefas:", err)
          setError("Erro ao carregar tarefas")
          setLoading(false)
        }
      },
      (err) => {
        console.error("Erro na subscrição:", err)
        setError("Erro de conexão com a base de dados")
        setLoading(false)
      },
    )

    return () => unsubscribe()
  }, [userProfile])

  const onDragEnd = async (result) => {
    const { destination, source, draggableId } = result

    if (!destination || (destination.droppableId === source.droppableId && destination.index === source.index)) {
      return
    }

    const taskRef = doc(db, "tasks", draggableId)

    try {
      await updateDoc(taskRef, {
        status: destination.droppableId,
        updatedAt: serverTimestamp(),
        movedAt: serverTimestamp(),
      })

      toast.success("Tarefa movida com sucesso!")
    } catch (error) {
      console.error("Erro ao mover tarefa:", error)
      toast.error("Erro ao mover a tarefa.")
    }
  }

  const handleAddTask = async (taskData) => {
    if (!canAddTasks) {
      toast.error("Não tem permissão para adicionar tarefas.")
      return
    }

    const selectedUser = assignableUsers.find((u) => u.id === taskData.assigneeId)
    if (!selectedUser) {
      toast.error("Utilizador responsável não encontrado.")
      return
    }

    const newTask = {
      title: taskData.title,
      description: taskData.description,
      assigneeId: taskData.assigneeId,
      assigneeName: selectedUser.name,
      status: "todo",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      movedAt: serverTimestamp(),
      createdBy: userProfile.id,
      createdByName: userProfile.name,
      dueDate: taskData.dueDate ? Timestamp.fromDate(new Date(taskData.dueDate + 'T00:00:00')) : null,
    }

    try {
      const promise = addDoc(collection(db, "tasks"), newTask)

      await toast.promise(promise, {
        loading: "A guardar tarefa...",
        success: "Tarefa adicionada com sucesso!",
        error: "Erro ao guardar a tarefa.",
      })

      setIsAddModalOpen(false)
    } catch (error) {
      console.error("Erro ao adicionar tarefa:", error)
    }
  }

  const handleOpenEditModal = (task) => {
    setTaskToEdit(task)
    setIsEditModalOpen(true)
  }

  const handleUpdateTask = async (taskId, updatedData) => {
    const taskRef = doc(db, "tasks", taskId)

    try {
      const dataToUpdate = {
        title: updatedData.title,
        description: updatedData.description,
        assigneeId: updatedData.assigneeId,
        assigneeName: updatedData.assigneeName,
        updatedAt: serverTimestamp(),
        updatedBy: userProfile.id,
        updatedByName: userProfile.name,
        dueDate: updatedData.dueDate ? Timestamp.fromDate(new Date(updatedData.dueDate + 'T00:00:00')) : null,
      }

      const promise = updateDoc(taskRef, dataToUpdate)

      await toast.promise(promise, {
        loading: "A atualizar tarefa...",
        success: "Tarefa atualizada com sucesso!",
        error: "Erro ao atualizar a tarefa.",
      })

      setIsEditModalOpen(false)
      setTaskToEdit(null)
    } catch (error) {
      console.error("Erro ao atualizar tarefa:", error)
    }
  }
  
  const handleToggleSelectTask = (taskId) => {
    setSelectedTasks(prevSelected => {
        const newSelected = new Set(prevSelected);
        if (newSelected.has(taskId)) {
            newSelected.delete(taskId);
        } else {
            newSelected.add(taskId);
        }
        return newSelected;
    });
  };

  const handleSelectAllDone = (doneTaskIds) => {
    const allSelected = doneTaskIds.length > 0 && doneTaskIds.every(id => selectedTasks.has(id));
    if (allSelected) {
        setSelectedTasks(new Set());
    } else {
        setSelectedTasks(new Set(doneTaskIds));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedTasks.size === 0) {
        toast.error("Nenhuma tarefa selecionada.");
        return;
    }

    const confirmDelete = window.confirm(`Tem certeza que deseja apagar as ${selectedTasks.size} tarefas selecionadas? Esta ação é irreversível.`);
    if (!confirmDelete) return;

    const batch = writeBatch(db);
    selectedTasks.forEach(taskId => {
        const taskRef = doc(db, "tasks", taskId);
        batch.delete(taskRef);
    });

    try {
        const promise = batch.commit();
        await toast.promise(promise, {
            loading: 'Apagando tarefas...',
            success: 'Tarefas selecionadas apagadas com sucesso!',
            error: 'Erro ao apagar as tarefas.'
        });
        setSelectedTasks(new Set());
    } catch (error) {
        console.error("Erro ao apagar tarefas em lote:", error);
        toast.error("Ocorreu um erro ao apagar as tarefas.");
    }
  };

  const handleDeleteTask = async (taskId) => {
    const confirmDelete = window.confirm("Tem a certeza de que deseja apagar esta tarefa? Esta ação é irreversível.")

    if (!confirmDelete) return

    const taskRef = doc(db, "tasks", taskId)

    try {
      const promise = deleteDoc(taskRef)

      await toast.promise(promise, {
        loading: "A apagar tarefa...",
        success: "Tarefa apagada com sucesso!",
        error: "Erro ao apagar a tarefa.",
      })
    } catch (error) {
      console.error("Erro ao apagar tarefa:", error)
    }
  }

  const handleCloseModals = () => {
    setIsAddModalOpen(false)
    setIsEditModalOpen(false)
    setTaskToEdit(null)
  }

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="mt-2 text-gray-600">Carregando tarefas...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
        <p className="text-red-600 font-semibold">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          Tentar Novamente
        </button>
      </div>
    )
  }

  if (!userProfile) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-600">Por favor, faça login para aceder ao quadro de tarefas.</p>
      </div>
    )
  }

  return (
    <>
      <div className="p-4 md:p-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Quadro de Tarefas</h1>
            <p className="text-sm text-gray-600 mt-1">
              Bem-vindo, {userProfile.name} ({userProfile.role})! 👋
            </p>
          </div>

          {canAddTasks && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 bg-blue-600 text-white font-bold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200 shadow-md hover:shadow-lg"
            >
              <PlusCircle size={18} />
              Adicionar Tarefa
            </button>
          )}
        </div>

        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {columnOrder.map((columnId) => {
              const column = columns[columnId]
              const columnTasks = column.taskIds.map((taskId) => tasks[taskId]).filter(Boolean)
              const canManageTasks = userProfile && (userProfile.role === 'coordenador' || userProfile.role === 'diretor');
              const doneTaskIds = column.id === 'done' ? column.taskIds : [];
              const allDoneSelected = canManageTasks && doneTaskIds.length > 0 && doneTaskIds.every(id => selectedTasks.has(id));

              return (
                <div key={column.id} className="bg-gray-50 rounded-lg flex flex-col">
                  <div className={`p-4 rounded-t-lg ${column.headerColor}`}>
                    <div className="flex justify-center items-center gap-2">
                      {column.id === 'done' && doneTaskIds.length > 0 && canManageTasks && (
                          <input
                              type="checkbox"
                              checked={allDoneSelected}
                              onChange={() => handleSelectAllDone(doneTaskIds)}
                              title={allDoneSelected ? "Desmarcar Todos" : "Marcar Todos"}
                              className="h-5 w-5 rounded border-gray-300 text-blue-600 bg-transparent focus:ring-white ring-offset-0 cursor-pointer"
                          />
                      )}
                      <h3 className="font-bold text-white text-lg">
                        {column.title}
                        <span className="ml-2 text-sm opacity-80">({columnTasks.length})</span>
                      </h3>
                    </div>
                    {column.id === 'done' && selectedTasks.size > 0 && canManageTasks && (
                        <div className="text-center mt-2">
                            <button
                                onClick={handleDeleteSelected}
                                className="w-full bg-red-500 text-white font-bold px-3 py-1 rounded-lg hover:bg-red-600 text-sm flex items-center justify-center gap-2"
                            >
                                <Trash2 size={14} />
                                <span>Apagar {selectedTasks.size} Selecionadas</span>
                            </button>
                        </div>
                    )}
                  </div>

                  <Droppable droppableId={column.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`p-4 flex-grow min-h-[200px] transition-colors duration-200 ${
                          snapshot.isDraggingOver ? "bg-gray-100" : "bg-gray-50"
                        }`}
                      >
                        {columnTasks.length === 0 ? (
                          <div className="text-center text-gray-400 py-8">
                            <p className="text-sm">Nenhuma tarefa</p>
                          </div>
                        ) : (
                          columnTasks.map((task, index) => {
                            const canEditOrDelete = userProfile && (userProfile.role === 'coordenador' || userProfile.role === 'diretor');
                            const canDrag = userProfile && (canEditOrDelete || task.assigneeId === userProfile.id);
                            return (
                               <TaskCard
                                  key={task.id}
                                  task={task}
                                  column={column}
                                  index={index}
                                  userProfile={userProfile}
                                  canEditOrDelete={canEditOrDelete}
                                  canDrag={canDrag}
                                  onEdit={handleOpenEditModal}
                                  onDelete={handleDeleteTask}
                                  isSelected={selectedTasks.has(task.id)}
                                  onSelect={handleToggleSelectTask}
                                />
                            )
                          })
                        )}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              )
            })}
          </div>
        </DragDropContext>
      </div>

      <AddTaskModal isOpen={isAddModalOpen} onClose={handleCloseModals} onSave={handleAddTask} users={assignableUsers} />
      <EditTaskModal isOpen={isEditModalOpen} onClose={handleCloseModals} onSave={handleUpdateTask} task={taskToEdit} users={users} />
    </>
  )
}

export default KanbanPage