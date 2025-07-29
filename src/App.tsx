import React, { useState, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

interface TurboItem {
  id: string;
  model: string;
  bay?: string; // Optional for backward compatibility
  location?: string; // Backend might return this
  quantity: number;
  isLowStock: boolean;
  priority?: boolean; // Priority flag
}

interface NewTurboForm {
  model: string;
  bay: string;
  quantity: string;
  multipleModels: boolean;
  bigSmallVariants: boolean;
  priority: boolean;
  bigModels: string;
  bigQuantity: string;
  smallModels: string;
  smallQuantity: string;
}

interface LoginForm {
  username: string;
  password: string;
}

interface PendingOrder {
  id: string;
  partNumber: string;
  model: string;
  location: string;
  quantity: number;
  orderDate: string;
  status: 'pending' | 'arrived';
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSellModal, setShowSellModal] = useState(false);
  const [showLowStockModal, setShowLowStockModal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [editingTurbo, setEditingTurbo] = useState<TurboItem | null>(null);
  const [sellingTurbo, setSellingTurbo] = useState<TurboItem | null>(null);
  const [sellQuantity, setSellQuantity] = useState(1);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [turboItems, setTurboItems] = useState<TurboItem[]>([]);
  const [turboStats, setTurboStats] = useState({
    totalItems: 0,
    lowStockItems: 0,
    totalQuantity: 0
  });
  const [loginForm, setLoginForm] = useState<LoginForm>({
    username: '',
    password: ''
  });
  const [newTurboForm, setNewTurboForm] = useState<NewTurboForm>({
    model: '',
    bay: '',
    quantity: '',
    multipleModels: false,
    bigSmallVariants: false,
    priority: false,
    bigModels: '',
    bigQuantity: '0',
    smallModels: '',
    smallQuantity: '0'
  });
  
  // State for order quantities
  const [orderQuantities, setOrderQuantities] = useState<{[key: string]: number}>({});

  // API Base URL - Use deployed backend or fallback to localhost
  const API_BASE_URL =  'https://turbo-backend-henna.vercel.app/api';
  // const API_BASE_URL =  'http://localhost:5000/api';
  
  // Debug log to check which URL is being used
  console.log('API_BASE_URL:', API_BASE_URL);

  // Session persistence functions
  const checkSession = () => {
    const session = localStorage.getItem('turbo_session');
    if (session) {
      try {
        const sessionData = JSON.parse(session);
        const now = Date.now();
        const sessionAge = now - sessionData.timestamp;
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        // Check if session is still valid
        if (sessionData.timestamp && sessionAge < maxAge) {
          // Warn user if session is about to expire (within 1 hour)
          const warningThreshold = 23 * 60 * 60 * 1000; // 23 hours
          if (sessionAge > warningThreshold) {
            const remainingHours = Math.ceil((maxAge - sessionAge) / (60 * 60 * 1000));
            toast.warning(`Session expires in ${remainingHours} hour(s). Please save your work.`);
          }
          return true;
        } else {
          // Session expired, clear it
          localStorage.removeItem('turbo_session');
          toast.info('Session expired. Please log in again.');
        }
      } catch (error) {
        console.error('Error parsing session data:', error);
        localStorage.removeItem('turbo_session');
      }
    }
    return false;
  };

  const saveSession = () => {
    const sessionData = {
      timestamp: Date.now(),
      username: loginForm.username
    };
    localStorage.setItem('turbo_session', JSON.stringify(sessionData));
  };

  const refreshSession = () => {
    const session = localStorage.getItem('turbo_session');
    if (session) {
      try {
        const sessionData = JSON.parse(session);
        sessionData.timestamp = Date.now();
        localStorage.setItem('turbo_session', JSON.stringify(sessionData));
      } catch (error) {
        console.error('Error refreshing session:', error);
      }
    }
  };

  const clearSession = () => {
    localStorage.removeItem('turbo_session');
  };

  // Helper function to determine if an item is low stock
  const isLowStockItem = (quantity: number, priority: boolean = false): boolean => {
    if (priority) {
      return quantity <= 5; // Priority items: low stock if 5 or less
    }
    return quantity <= 1; // Regular items: low stock if 1 or less
  };

  // Helper function to refresh data with loading state
  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchAllTurbos(),
        fetchTurboStats(),
        fetchPendingOrders()
      ]);
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Check for existing session on component mount
  useEffect(() => {
    if (checkSession()) {
      setIsAuthenticated(true);
      console.log('Session restored from localStorage');
    }
  }, []);

  // Refresh session on user activity
  useEffect(() => {
    if (isAuthenticated) {
      const handleUserActivity = () => {
        refreshSession();
      };

      // Refresh session on user interactions
      const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
      events.forEach(event => {
        document.addEventListener(event, handleUserActivity, { passive: true });
      });

      return () => {
        events.forEach(event => {
          document.removeEventListener(event, handleUserActivity);
        });
      };
    }
  }, [isAuthenticated]);

  // Fetch data when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      console.log('User authenticated, fetching data...');
      fetchAllTurbos();
      fetchTurboStats();
      fetchPendingOrders();
    }
  }, [isAuthenticated]);

  // API Functions
  const fetchAllTurbos = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/turbos`);
      if (response.ok) {
        const data = await response.json();
        console.log('Raw API response:', data); // Debug log
        
        // Backend returns { turbos: [...] }
        const turbosArray = data.turbos || [];
        
        // Transform backend data to frontend format
        const transformedTurbos = turbosArray.map((turbo: any) => {
          console.log('Processing turbo:', turbo); // Debug each turbo item
          
          // Handle different data structures
          if (turbo.hasSizeOption && turbo.sizeVariants) {
            // Big/Small variants - create separate items for each
            const items: any[] = [];
            
            if (turbo.sizeVariants.big && turbo.sizeVariants.big.partNumbers) {
              turbo.sizeVariants.big.partNumbers.forEach((partNumber: string) => {
                if (partNumber && partNumber.trim()) { // Only add if partNumber exists
                  items.push({
                    id: partNumber,
                    model: partNumber,
                    location: turbo.location || 'No location',
                    bay: turbo.location || 'No location', // For backward compatibility
                    quantity: turbo.sizeVariants.big.quantity || 0,
                    isLowStock: isLowStockItem(turbo.sizeVariants.big.quantity || 0, turbo.priority || false),
                    priority: turbo.priority || false
                  });
                }
              });
            }
            
            if (turbo.sizeVariants.small && turbo.sizeVariants.small.partNumbers) {
              turbo.sizeVariants.small.partNumbers.forEach((partNumber: string) => {
                if (partNumber && partNumber.trim()) { // Only add if partNumber exists
                  items.push({
                    id: partNumber,
                    model: partNumber,
                    location: turbo.location || 'No location',
                    bay: turbo.location || 'No location', // For backward compatibility
                    quantity: turbo.sizeVariants.small.quantity || 0,
                    isLowStock: isLowStockItem(turbo.sizeVariants.small.quantity || 0, turbo.priority || false),
                    priority: turbo.priority || false
                  });
                }
              });
            }
            
            return items;
          } else {
            // Regular turbo items
            return (turbo.partNumbers || []).map((partNumber: string) => {
              if (partNumber && partNumber.trim()) { // Only add if partNumber exists
                return {
                  id: partNumber,
                  model: partNumber,
                  location: turbo.location || 'No locationssss',
                  bay: turbo.location || 'No location', // For backward compatibility
                  quantity: turbo.quantity || 0,
                  isLowStock: isLowStockItem(turbo.quantity || 0, turbo.priority || false),
                  priority: turbo.priority || false
                };
              }
              return null; // Skip invalid items
            }).filter(Boolean); // Remove null items
          }
        }).flat(); // Flatten the array of arrays
        
        console.log('Transformed turbos:', transformedTurbos); // Debug log
        setTurboItems(transformedTurbos);
      } else {
        toast.error('Failed to fetch turbo items');
        setTurboItems([]); // Set empty array on error
      }
    } catch (error) {
      console.error('Error fetching turbos:', error);
      toast.error('Network error while fetching turbo items');
      setTurboItems([]); // Set empty array on error
    }
  };

  const fetchTurboStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/turbos/stats`);
      if (response.ok) {
        const data = await response.json();
        setTurboStats(data);
      } else {
        toast.error('Failed to fetch turbo statistics');
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
      toast.error('Network error while fetching statistics');
    }
  };

  // Fetch all pending orders from the backend
  const fetchPendingOrders = async () => {
    try {
      console.log('Fetching pending orders...');
      const response = await fetch(`${API_BASE_URL}/api/pending-orders`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Received pending orders data:', data);
        
        // Transform backend data to frontend format
        const transformedOrders: PendingOrder[] = data.pendingOrders.map((order: any) => ({
          id: order._id,
          partNumber: order.partNumber,
          model: order.modelName, // Backend uses modelName
          location: order.location,
          quantity: order.quantity,
          orderDate: new Date(order.orderDate).toISOString(),
          status: order.status
        }));
        
        setPendingOrders(transformedOrders);
        console.log('Transformed pending orders:', transformedOrders);
      } else {
        console.error('Failed to fetch pending orders:', response.status);
        toast.error('Failed to fetch pending orders');
      }
    } catch (error) {
      console.error('Error fetching pending orders:', error);
      toast.error('Network error while fetching pending orders');
    }
  };

  const addTurbo = async (turboData: any) => {
    try {
      const response = await fetch(`${API_BASE_URL}/create-turbo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(turboData)
      });

      if (response.ok) {
        const newTurbo = await response.json();
        console.log('Backend response for new turbo:', newTurbo); // Debug log
        toast.success('Turbo added successfully!');
        setShowModal(false);
        setNewTurboForm({
          model: '',
          bay: '',
          quantity: '',
          multipleModels: false,
          bigSmallVariants: false,
          priority: false,
          bigModels: '',
          bigQuantity: '0',
          smallModels: '',
          smallQuantity: '0'
        });
        // Add a small delay to ensure backend has processed the addition
        setTimeout(() => {
          refreshData();
        }, 500);
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to add turbo');
      }
    } catch (error) {
      console.error('Error adding turbo:', error);
      toast.error('Network error while adding turbo');
    }
  };

  const updateTurbo = async (id: string, updateData: any) => {
    try {
      // Find the turbo item to get the MongoDB _id
      const turboItem = turboItems.find(item => item.id === id);
      if (!turboItem) {
        toast.error('Turbo item not found');
        return;
      }

      // We need to find the actual MongoDB document that contains this part number
      // For now, let's try to update by part number in the backend
      console.log('Sending update request with data:', {
        partNumber: id,
        ...updateData
      });
      console.log('Priority field type:', typeof updateData.priority);
      console.log('Priority field value:', updateData.priority);
      
      const response = await fetch(`${API_BASE_URL}/turbos/update-by-partnumber`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          partNumber: id,
          ...updateData
        })
      });

      if (response.ok) {
        const result = await response.json();
        toast.success('Turbo updated successfully!');
        // Add a small delay to ensure backend has processed the update
        setTimeout(() => {
          refreshData();
        }, 500);
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to update turbo');
      }
    } catch (error) {
      console.error('Error updating turbo:', error);
      toast.error('Network error while updating turbo');
    }
  };

  const deleteTurbo = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/turbos/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast.success('Turbo deleted successfully!');
        // Add a small delay to ensure backend has processed the deletion
        setTimeout(() => {
          refreshData();
        }, 500);
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to delete turbo');
      }
    } catch (error) {
      console.error('Error deleting turbo:', error);
      toast.error('Network error while deleting turbo');
    }
  };



  // Load data on component mount
  React.useEffect(() => {
    if (isAuthenticated) {
      fetchAllTurbos();
      fetchTurboStats();
    }
  }, [isAuthenticated]);

  // Populate form when editing
  React.useEffect(() => {
    if (editingTurbo) {
      console.log('Populating form with editingTurbo:', editingTurbo);
      setNewTurboForm({
        model: editingTurbo.model || '',
        bay: editingTurbo.location || editingTurbo.bay || '',
        quantity: editingTurbo.quantity?.toString() || '',
        multipleModels: false,
        bigSmallVariants: false,
        priority: editingTurbo.priority || false,
        bigModels: '',
        bigQuantity: '0',
        smallModels: '',
        smallQuantity: '0'
      });
    }
  }, [editingTurbo]);

  // Get low stock items for order modal
  const lowStockItems = Array.isArray(turboItems) ? turboItems.filter(item => item.isLowStock) : [];

  const filteredItems = Array.isArray(turboItems) ? turboItems.filter(item =>
    (item.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.model || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.bay || item.location || '').toLowerCase().includes(searchTerm.toLowerCase())
  ) : [];

  const totalItems = turboStats.totalItems;
  const lowStockItemsCount = turboStats.lowStockItems;
  const totalQuantity = turboStats.totalQuantity;

  const handleLoginInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLoginForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!loginForm.username || !loginForm.password) {
      toast.error('Please enter both username and password.');
      return;
    }
    
    setIsLoading(true);
    
    try {
      const response = await fetch('https://turbo-backend-henna.vercel.app/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: loginForm.username,
          password: loginForm.password
        })
      });

      const data = await response.json();

      if (response.ok) {
        // Login successful
        setIsAuthenticated(true);
        saveSession(); // Save session to localStorage
        setLoginForm({ username: '', password: '' });
        toast.success('Login successful!');
      } else {
        // Login failed
        toast.error(data.message || 'Login failed. Please check your credentials.');
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Network error. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    clearSession(); // Clear session from localStorage
    toast.success('Logged out successfully!');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    console.log('handleInputChange called for:', e.target.name, 'value:', e.target.value);
    console.log('Modal state when handleInputChange called:', showModal);
    
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setNewTurboForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSaveTurbo = () => {
    console.log('handleSaveTurbo called - this should not happen from search!');
    console.log('Current search term:', searchTerm);
    console.log('Modal state:', showModal);
    
    // Prevent execution if modal is not open
    if (!showModal) {
      console.log('Modal not open, preventing save');
      return;
    }
    
    // Check if model field is filled
    if (!newTurboForm.model.trim()) {
      toast.error('Please enter model name(s)');
      return;
    }
    
    // Check if bay/location is filled
    if (!newTurboForm.bay.trim()) {
      toast.error('Please enter bay location');
      return;
    }
    
    // Check if quantity is filled
    if (!newTurboForm.quantity || parseInt(newTurboForm.quantity) <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }

    // Convert model string to array if multiple models
    const modelArray = newTurboForm.multipleModels 
      ? newTurboForm.model.split(',').map(m => m.trim()).filter(m => m.length > 0)
      : [newTurboForm.model];

    const turboData: any = {
      location: newTurboForm.bay, // Changed from 'bay' to 'location' to match backend
      quantity: parseInt(newTurboForm.quantity),
      hasSizeOption: newTurboForm.bigSmallVariants, // Backend expects this field name
      priority: newTurboForm.priority, // Add priority flag
    };

    // Handle big/small variants
    if (newTurboForm.bigSmallVariants) {
      const sizeVariants: any = {};
      
      if (newTurboForm.bigModels) {
        sizeVariants.big = {
          partNumbers: newTurboForm.bigModels.split(',').map(m => m.trim()).filter(m => m.length > 0),
          quantity: parseInt(newTurboForm.bigQuantity)
        };
      }
      
      if (newTurboForm.smallModels) {
        sizeVariants.small = {
          partNumbers: newTurboForm.smallModels.split(',').map(m => m.trim()).filter(m => m.length > 0),
          quantity: parseInt(newTurboForm.smallQuantity)
        };
      }
      
      turboData.sizeVariants = sizeVariants;
    } else {
      // No size variants, send partNumbers array
      turboData.partNumbers = modelArray;
    }

    console.log('Sending turbo data:', turboData); // Debug log
    addTurbo(turboData);
  };

  const handleCancel = () => {
    setShowModal(false);
    setNewTurboForm({
      model: '',
      bay: '',
      quantity: '',
      multipleModels: false,
      bigSmallVariants: false,
      priority: false,
      bigModels: '',
      bigQuantity: '0',
      smallModels: '',
      smallQuantity: '0'
    });
  };

  const handleOrderCancel = () => {
    setShowOrderModal(false);
    setOrderQuantities({});
  };

  const handleIndividualGenerateOrder = async (item: TurboItem) => {
    const quantity = orderQuantities[item.id] || 0;
    if (quantity <= 0) {
      toast.error('Please select a quantity to order');
      return;
    }

    try {
      // Create order in the backend
      const response = await fetch(`${API_BASE_URL}/api/pending-orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          partNumber: item.id,
          modelName: item.model,
          location: item.location || item.bay || 'Unknown',
          quantity
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Created pending order:', result);
        
        // Clear this item's quantity from the form
        setOrderQuantities(prev => {
          const updated = { ...prev };
          delete updated[item.id];
          return updated;
        });
        
        // Refresh pending orders from backend
        await fetchPendingOrders();
        
        toast.success(`Generated order for ${item.model} (${quantity} units) and added to pending list!`);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to create pending order');
      }
    } catch (error) {
      console.error('Error creating pending order:', error);
      toast.error('Network error while creating pending order');
    }
  };

  const handleGenerateOrder = async () => {
    // Get all orders with quantities > 0
    const ordersToCreate = Object.entries(orderQuantities)
      .filter(([_, quantity]) => quantity > 0)
      .map(([partNumber, quantity]) => {
        const turbo = turboItems.find(item => item.id === partNumber);
        return {
          partNumber,
          modelName: turbo?.model || partNumber,
          location: turbo?.location || turbo?.bay || 'Unknown',
          quantity
        };
      });

    if (ordersToCreate.length === 0) {
      toast.error('Please select quantities to order');
      return;
    }

    try {
      // Create all orders in the backend
      const createPromises = ordersToCreate.map(order => 
        fetch(`${API_BASE_URL}/api/pending-orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(order)
        })
      );

      const responses = await Promise.all(createPromises);
      const failedResponses = responses.filter(response => !response.ok);
      
      if (failedResponses.length === 0) {
        // All orders created successfully
        toast.success(`Generated ${ordersToCreate.length} order(s) and added to pending list!`);
        setShowOrderModal(false);
        setOrderQuantities({});
        
        // Refresh pending orders from backend
        await fetchPendingOrders();
      } else {
        toast.error(`Failed to create ${failedResponses.length} order(s)`);
      }
    } catch (error) {
      console.error('Error creating pending orders:', error);
      toast.error('Network error while creating pending orders');
    }
  };

  const handleQuantityChange = (itemId: string, change: number) => {
    const currentQuantity = orderQuantities[itemId] || 0;
    const newQuantity = Math.max(0, currentQuantity + change);
    setOrderQuantities(prev => ({
      ...prev,
      [itemId]: newQuantity
    }));
  };

  const handleEditTurbo = (turbo: TurboItem) => {
    setEditingTurbo(turbo);
    setShowEditModal(true);
  };

  const handleEditSave = async () => {
    if (!editingTurbo) return;

    // Check if model field is filled
    if (!newTurboForm.model.trim()) {
      toast.error('Please enter model name(s)');
      return;
    }
    
    // Check if bay/location is filled
    if (!newTurboForm.bay.trim()) {
      toast.error('Please enter bay location');
      return;
    }
    
    // Check if quantity is filled
    if (!newTurboForm.quantity || parseInt(newTurboForm.quantity) <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }

    // Convert model string to array if multiple models
    const modelArray = newTurboForm.multipleModels 
      ? newTurboForm.model.split(',').map(m => m.trim()).filter(m => m.length > 0)
      : [newTurboForm.model];

    const updateData: any = {
      location: newTurboForm.bay,
      quantity: parseInt(newTurboForm.quantity),
      hasSizeOption: newTurboForm.bigSmallVariants,
      priority: newTurboForm.priority, // Add priority flag
    };

    // Handle big/small variants
    if (newTurboForm.bigSmallVariants) {
      const sizeVariants: any = {};
      
      if (newTurboForm.bigModels) {
        sizeVariants.big = {
          partNumbers: newTurboForm.bigModels.split(',').map(m => m.trim()).filter(m => m.length > 0),
          quantity: parseInt(newTurboForm.bigQuantity)
        };
      }
      
      if (newTurboForm.smallModels) {
        sizeVariants.small = {
          partNumbers: newTurboForm.smallModels.split(',').map(m => m.trim()).filter(m => m.length > 0),
          quantity: parseInt(newTurboForm.smallQuantity)
        };
      }
      
      updateData.sizeVariants = sizeVariants;
    } else {
      // No size variants, send partNumbers array
      updateData.partNumbers = modelArray;
    }

    console.log('Updating turbo data:', updateData); // Debug log
    console.log('Editing turbo priority:', editingTurbo.priority);
    console.log('New form priority:', newTurboForm.priority);
    await updateTurbo(editingTurbo.id, updateData);
    setShowEditModal(false);
    setEditingTurbo(null);
    resetForm();
  };

  const handleEditCancel = () => {
    setShowEditModal(false);
    setEditingTurbo(null);
    resetForm();
  };

  const handleDeleteTurbo = async (id: string) => {
    if (!id) {
      toast.error('Invalid item ID');
      return;
    }

    // Show confirmation dialog
    if (window.confirm('Are you sure you want to delete this turbo? This action cannot be undone.')) {
      await deleteTurbo(id);
    }
  };

  const handleSellClick = (turbo: TurboItem) => {
    setSellingTurbo(turbo);
    setSellQuantity(1);
    setShowSellModal(true);
  };

  const handleSellCancel = () => {
    setShowSellModal(false);
    setSellingTurbo(null);
    setSellQuantity(1);
  };

  const handleLowStockClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Low stock card clicked!');
    console.log('Event target:', e.target);
    console.log('Current target:', e.currentTarget);
    console.log('Current showLowStockModal:', showLowStockModal);
    setShowLowStockModal(true);
    console.log('Setting showLowStockModal to true');
  };

  const handleLowStockClose = () => {
    setShowLowStockModal(false);
  };

  const handlePendingClick = () => {
    setShowPendingModal(true);
  };

  const handlePendingClose = () => {
    setShowPendingModal(false);
  };

  const handleOrderArrived = async (order: PendingOrder) => {
    try {
      console.log('Marking order as arrived:', order);
      
      // First, update the turbo quantity in the backend
      const turboResponse = await fetch(`${API_BASE_URL}/turbos/update-by-partnumber`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          partNumber: order.partNumber,
          quantity: order.quantity,
          operation: 'add' // Add the ordered quantity to existing stock
        })
      });

      console.log('Turbo update response status:', turboResponse.status);
      
      if (turboResponse.ok) {
        const turboResult = await turboResponse.json();
        console.log('Turbo update success result:', turboResult);
        
        // Now mark the pending order as arrived in the backend
        const orderResponse = await fetch(`${API_BASE_URL}/api/pending-orders/${order.id}/arrived`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          }
        });

        console.log('Order status update response status:', orderResponse.status);
        
        if (orderResponse.ok) {
          const orderResult = await orderResponse.json();
          console.log('Order status update success result:', orderResult);
          
          // Refresh pending orders from backend
          await fetchPendingOrders();
          
          // Add a small delay to ensure backend has processed the quantity update
          setTimeout(() => {
            refreshData();
          }, 500);
          
          toast.success(`Order for ${order.model} marked as arrived! Quantity added to stock.`);
        } else {
          const error = await orderResponse.json();
          console.log('Order status update error response:', error);
          toast.error(error.error || 'Failed to update order status');
        }
      } else {
        const error = await turboResponse.json();
        console.log('Turbo update error response:', error);
        toast.error(error.error || 'Failed to update turbo quantity');
      }
    } catch (error) {
      console.error('Error marking order as arrived:', error);
      toast.error('Network error while updating order status');
    }
  };

  const handleSellConfirm = async () => {
    if (!sellingTurbo) return;

    // Check if quantity is valid
    if (sellQuantity <= 0) {
      toast.error('Please enter a valid quantity to sell');
      return;
    }

    // Check if we have enough stock
    if (sellQuantity > sellingTurbo.quantity) {
      toast.error(`Not enough quantity to sell. Available: ${sellingTurbo.quantity}`);
      return;
    }

    // Ask for confirmation
    if (window.confirm(`Do you really want to sell ${sellQuantity} turbo(s) of ${sellingTurbo.model}?`)) {
      try {
        console.log('Selling turbo:', sellingTurbo.id, 'Quantity:', sellQuantity);
        console.log('API URL:', `${API_BASE_URL}/turbos/sell`);
        
        // Call the new sell API endpoint
        const response = await fetch(`${API_BASE_URL}/turbos/sell`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            partNumber: sellingTurbo.id,
            quantity: sellQuantity
          })
        });

        console.log('Response status:', response.status);
        console.log('Response URL:', response.url);
        
        if (response.ok) {
          const result = await response.json();
          console.log('Success result:', result);
          toast.success(result.message || `Successfully sold ${sellQuantity} turbo(s)!`);
          setShowSellModal(false);
          setSellingTurbo(null);
          setSellQuantity(1);
          // Add a small delay to ensure backend has processed the sale
          setTimeout(() => {
            refreshData();
          }, 500);
        } else {
          const error = await response.json();
          console.log('Error response:', error);
          if (error.error === 'Not enough quantity to sell') {
            toast.error(`Not enough quantity to sell. Available: ${error.available}, Requested: ${error.requested}`);
          } else {
            toast.error(error.error || error.message || 'Failed to sell turbo');
          }
        }
      } catch (error) {
        console.error('Error selling turbo:', error);
        toast.error('Network error while selling turbo');
      }
    }
  };

  const resetForm = () => {
    setNewTurboForm({
      model: '',
      bay: '',
      quantity: '',
      multipleModels: false,
      bigSmallVariants: false,
      priority: false,
      bigModels: '',
      bigQuantity: '0',
      smallModels: '',
      smallQuantity: '0'
    });
  };

  const totalItemsToOrder = Object.values(orderQuantities).reduce((sum, quantity) => sum + quantity, 0);

  // Login Page
  if (!isAuthenticated) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <div className="logo-container">
              <img 
                src="/logo.png" 
                alt="Precision Turbo Services" 
                className="company-logo"
              />
            </div>
          </div>
          
          <form className="login-form" onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                name="username"
                value={loginForm.username}
                onChange={handleLoginInputChange}
                className="login-input"
                placeholder="Enter your username"
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                value={loginForm.password}
                onChange={handleLoginInputChange}
                className="login-input"
                placeholder="Enter your password"
                required
              />
            </div>
            
            <button type="submit" className="login-btn" disabled={isLoading}>
              {isLoading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
          
          <div className="login-footer">
            <p>Demo Credentials: Any username/password</p>
          </div>
        </div>
        <ToastContainer />
      </div>
    );
  }

  // Main Dashboard
  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <img 
            src="/logo.png" 
            alt="Precision Turbo Services" 
            className="header-logo"
          />
        </div>
        <div className="header-content">
          <div className="header-title">
            <h1>Precision Turbo Stock Management</h1>
          </div>
          <p className="header-subtitle">Manage your turbo inventory with precision and efficiency.</p>
        </div>
        <div className="header-right">
          {isRefreshing && (
            <div className="refresh-indicator">
              <span className="refresh-icon">🔄</span>
              <span className="refresh-text">Refreshing...</span>
            </div>
          )}
          <button className="logout-btn" onClick={handleLogout}>
            <span className="logout-icon">🚪</span>
            Logout
          </button>
        </div>
      </header>

      {/* Search and Action Bar */}
      <div className="search-action-bar">
        <div className="search-container">
          <input
            type="text"
            placeholder="Search turbos by ID, model, or bay..."
            value={searchTerm}
            onChange={(e) => {
              console.log('Search onChange triggered:', e.target.value);
              setSearchTerm(e.target.value);
            }}
            onKeyDown={(e) => {
              console.log('Search key pressed:', e.key);
              if (e.key === 'Enter') {
                e.preventDefault();
                console.log('Enter pressed in search - preventing default');
              }
            }}
            onFocus={(e) => {
              console.log('Search input focused');
            }}
            onBlur={(e) => {
              console.log('Search input blurred');
            }}
            className="search-input"
          />
          <span className="search-icon">🔍</span>
        </div>
        <div className="action-buttons">
          <button className="btn btn-purple" onClick={() => setShowModal(true)}>
            <span className="btn-icon">+</span>
            Add New Turbo
          </button>
          <button className="btn btn-orange" onClick={() => setShowOrderModal(true)}>
            <span className="btn-icon">📦</span>
            Order Now
          </button>
          <button className="btn btn-blue" onClick={handlePendingClick}>
            <span className="btn-icon">⏳</span>
            Pending ({pendingOrders.filter(o => o.status === 'pending').length})
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="card-number">{totalItems}</div>
          <div className="card-label">Total Items</div>
        </div>
        <div 
          className="summary-card clickable" 
          onClick={handleLowStockClick}
          onMouseDown={(e) => e.preventDefault()}
          style={{ userSelect: 'none' }}
        >
          <div className="card-number">{lowStockItemsCount}</div>
          <div className="card-label">Low Stock Items (Click to view)</div>
        </div>
        <div className="summary-card">
          <div className="card-number">{totalQuantity}</div>
          <div className="card-label">Total Quantity</div>
        </div>
      </div>

      {/* Turbo Items Grid */}
      <div className="turbo-grid">
        {filteredItems.map((item) => (
          <div key={item.id || 'unknown'} className="turbo-card">
            <div className="turbo-id">#{item.id || 'Unknown'}</div>
            <div className="turbo-model">{item.model || 'Unknown Model'}</div>
            <div className="turbo-location">
              <span className="location-icon">📍</span>
              {item.location || item.bay || 'No location'}
            </div>
            <div className="turbo-actions">
              <button 
                className="action-btn sell-btn" 
                onClick={() => handleSellClick(item)}
                disabled={!item.id || item.quantity <= 0}
              >
                <span className="action-icon">💰</span>
                Sell
              </button>
              <button 
                className="action-btn edit-btn"
                onClick={() => handleEditTurbo(item)}
              >
                <span className="action-icon">✏️</span>
                Edit
              </button>
              <button 
                className="action-btn delete-btn"
                onClick={() => handleDeleteTurbo(item.id || '')}
              >
                <span className="action-icon">🗑️</span>
                Delete
              </button>
            </div>
                            <div className={`quantity-badge ${item.quantity === 0 ? 'out-of-stock' : isLowStockItem(item.quantity, item.priority) ? 'low-stock' : 'in-stock'}`}>
              {item.quantity}
            </div>
            {item.priority && (
              <div className="priority-badge">
                ⭐ Priority
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal Overlay */}
      {showModal && (
        <div className="modal-overlay" onClick={handleCancel}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Add New Turbo</h2>
            
            <div className="modal-form">
              {!newTurboForm.bigSmallVariants ? (
                // Regular form
                <>
                  <div className="form-group">
                    <label htmlFor="model">Model</label>
                    {newTurboForm.multipleModels ? (
                      <textarea
                        id="model"
                        name="model"
                        value={newTurboForm.model}
                        onChange={handleInputChange}
                        className="form-input form-textarea"
                        placeholder="Enter multiple models separated by commas (e.g. 5303 970 0262, 5303 970 0338, 5303 970 0345)"
                        rows={4}
                      />
                    ) : (
                      <input
                        type="text"
                        id="model"
                        name="model"
                        value={newTurboForm.model}
                        onChange={handleInputChange}
                        className="form-input"
                        placeholder="Enter turbo model"
                      />
                    )}
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="bay">Bay</label>
                    <input
                      type="text"
                      id="bay"
                      name="bay"
                      value={newTurboForm.bay}
                      onChange={handleInputChange}
                      className="form-input"
                      placeholder="Enter bay location"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="quantity">Quantity</label>
                    <input
                      type="number"
                      id="quantity"
                      name="quantity"
                      value={newTurboForm.quantity}
                      onChange={handleInputChange}
                      className="form-input"
                      placeholder="Enter quantity"
                      min="0"
                    />
                  </div>
                </>
              ) : (
                // Big/Small Variants form
                <>
                  <div className="form-group">
                    <label htmlFor="bay">Bay</label>
                    <input
                      type="text"
                      id="bay"
                      name="bay"
                      value={newTurboForm.bay}
                      onChange={handleInputChange}
                      className="form-input"
                      placeholder="Enter bay location"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="bigModels">Big Models (separate with commas)</label>
                    <textarea
                      id="bigModels"
                      name="bigModels"
                      value={newTurboForm.bigModels}
                      onChange={handleInputChange}
                      className="form-input form-textarea"
                      placeholder="e.g. 846015, 825758, 883860"
                      rows={3}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="bigQuantity">Big Quantity</label>
                    <input
                      type="number"
                      id="bigQuantity"
                      name="bigQuantity"
                      value={newTurboForm.bigQuantity}
                      onChange={handleInputChange}
                      className="form-input"
                      placeholder="Enter big quantity"
                      min="0"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="smallModels">Small Models (separate with commas)</label>
                    <textarea
                      id="smallModels"
                      name="smallModels"
                      value={newTurboForm.smallModels}
                      onChange={handleInputChange}
                      className="form-input form-textarea"
                      placeholder="e.g. 846016, 883177, 825759"
                      rows={3}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="smallQuantity">Small Quantity</label>
                    <input
                      type="number"
                      id="smallQuantity"
                      name="smallQuantity"
                      value={newTurboForm.smallQuantity}
                      onChange={handleInputChange}
                      className="form-input"
                      placeholder="Enter small quantity"
                      min="0"
                    />
                  </div>
                </>
              )}
              
              <div className="form-group checkbox-group">
                <label className={`checkbox-label ${newTurboForm.bigSmallVariants ? 'disabled' : ''}`}>
                  <input
                    type="checkbox"
                    name="multipleModels"
                    checked={newTurboForm.multipleModels}
                    onChange={handleInputChange}
                    className="checkbox-input"
                    disabled={newTurboForm.bigSmallVariants}
                  />
                  <span className={`checkbox-text ${newTurboForm.bigSmallVariants ? 'disabled' : ''}`}>Multiple Models (separate with commas)</span>
                </label>
              </div>
              
              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="bigSmallVariants"
                    checked={newTurboForm.bigSmallVariants}
                    onChange={handleInputChange}
                    className="checkbox-input"
                  />
                  <span className="checkbox-text">Big/Small Variants</span>
                </label>
              </div>
              
              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="priority"
                    checked={newTurboForm.priority}
                    onChange={handleInputChange}
                    className="checkbox-input"
                  />
                  <span className="checkbox-text">Priority</span>
                </label>
              </div>
            </div>
            
            <div className="modal-actions">
              <button className="modal-btn cancel-btn" onClick={handleCancel}>
                Cancel
              </button>
              <button className="modal-btn save-btn" onClick={handleSaveTurbo}>
                Save Turbo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal Overlay */}
      {showEditModal && (
        <div className="modal-overlay" onClick={handleEditCancel}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Edit Turbo</h2>
            
            <div className="modal-form">
              {!newTurboForm.bigSmallVariants ? (
                // Regular form
                <>
                  <div className="form-group">
                    <label htmlFor="model">Model</label>
                    {newTurboForm.multipleModels ? (
                      <textarea
                        id="model"
                        name="model"
                        value={newTurboForm.model}
                        onChange={handleInputChange}
                        className="form-input form-textarea"
                        placeholder="Enter multiple models separated by commas (e.g. 5303 970 0262, 5303 970 0338, 5303 970 0345)"
                        rows={4}
                      />
                    ) : (
                      <input
                        type="text"
                        id="model"
                        name="model"
                        value={newTurboForm.model}
                        onChange={handleInputChange}
                        className="form-input"
                        placeholder="Enter turbo model"
                      />
                    )}
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="bay">Bay</label>
                    <input
                      type="text"
                      id="bay"
                      name="bay"
                      value={newTurboForm.bay}
                      onChange={handleInputChange}
                      className="form-input"
                      placeholder="Enter bay location"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="quantity">Quantity</label>
                    <input
                      type="number"
                      id="quantity"
                      name="quantity"
                      value={newTurboForm.quantity}
                      onChange={handleInputChange}
                      className="form-input"
                      placeholder="Enter quantity"
                      min="0"
                    />
                  </div>
                </>
              ) : (
                // Big/Small Variants form
                <>
                  <div className="form-group">
                    <label htmlFor="bay">Bay</label>
                    <input
                      type="text"
                      id="bay"
                      name="bay"
                      value={newTurboForm.bay}
                      onChange={handleInputChange}
                      className="form-input"
                      placeholder="Enter bay location"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="bigModels">Big Models (separate with commas)</label>
                    <textarea
                      id="bigModels"
                      name="bigModels"
                      value={newTurboForm.bigModels}
                      onChange={handleInputChange}
                      className="form-input form-textarea"
                      placeholder="e.g. 846015, 825758, 883860"
                      rows={3}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="bigQuantity">Big Quantity</label>
                    <input
                      type="number"
                      id="bigQuantity"
                      name="bigQuantity"
                      value={newTurboForm.bigQuantity}
                      onChange={handleInputChange}
                      className="form-input"
                      placeholder="Enter big quantity"
                      min="0"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="smallModels">Small Models (separate with commas)</label>
                    <textarea
                      id="smallModels"
                      name="smallModels"
                      value={newTurboForm.smallModels}
                      onChange={handleInputChange}
                      className="form-input form-textarea"
                      placeholder="e.g. 846016, 883177, 825759"
                      rows={3}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="smallQuantity">Small Quantity</label>
                    <input
                      type="number"
                      id="smallQuantity"
                      name="smallQuantity"
                      value={newTurboForm.smallQuantity}
                      onChange={handleInputChange}
                      className="form-input"
                      placeholder="Enter small quantity"
                      min="0"
                    />
                  </div>
                </>
              )}
              
              <div className="checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="multipleModels"
                    checked={newTurboForm.multipleModels}
                    onChange={handleInputChange}
                    className="checkbox-input"
                  />
                  <span className="checkbox-text">Multiple Models (separate with commas)</span>
                </label>
                
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="bigSmallVariants"
                    checked={newTurboForm.bigSmallVariants}
                    onChange={handleInputChange}
                    className="checkbox-input"
                  />
                  <span className="checkbox-text">Big/Small Variants</span>
                </label>
                
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="priority"
                    checked={newTurboForm.priority}
                    onChange={handleInputChange}
                    className="checkbox-input"
                  />
                  <span className="checkbox-text">Priority</span>
                </label>
              </div>
            </div>
            
            <div className="modal-actions">
              <button className="modal-btn cancel-btn" onClick={handleEditCancel}>
                Cancel
              </button>
              <button className="modal-btn save-btn" onClick={handleEditSave}>
                Update Turbo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Modal Overlay */}
      {showOrderModal && (
        <div className="modal-overlay" onClick={handleOrderCancel}>
          <div className="modal order-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="order-icon">📋</div>
              <h2 className="modal-title">Create Purchase Order</h2>
            </div>
            
            <div className="modal-form">
              <div className="instructions-box">
                <strong>Instructions:</strong> Use +/- buttons to select quantities to order for low stock items. Click 'Generate Order' on individual items or use the main button for all selected items.
              </div>
              
              <div className="order-items-list">
                {lowStockItems.map((item) => (
                  <div key={item.id} className="order-item-card low-stock-item">
                    <div className="item-details">
                      <div className="item-id">{item.id}</div>
                      <div className="item-info">
                        <span>Model: {item.model}</span>
                        <span>Location: {item.location || item.bay}</span>
                        {item.priority && <span className="priority-indicator">⭐ Priority</span>}
                      </div>
                      <div className={`stock-status ${item.quantity === 0 ? 'out-of-stock' : 'low-stock'}`}>
                        Current Stock: {item.quantity === 0 ? 'OUT OF STOCK' : `${item.quantity} left`}
                      </div>
                    </div>
                    <div className="quantity-controls">
                      <span className="quantity-label">Quantity to Order:</span>
                      <div className="quantity-input-group">
                        <button 
                          className="quantity-btn minus-btn"
                          onClick={() => handleQuantityChange(item.id, -1)}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          className="quantity-input"
                          value={orderQuantities[item.id] || 0}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 0;
                            setOrderQuantities(prev => ({
                              ...prev,
                              [item.id]: Math.max(0, value)
                            }));
                          }}
                          min="0"
                        />
                        <button 
                          className="quantity-btn plus-btn"
                          onClick={() => handleQuantityChange(item.id, 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="individual-order-actions">
                      <button 
                        className="modal-btn save-btn individual-order-btn"
                        onClick={() => handleIndividualGenerateOrder(item)}
                        disabled={(orderQuantities[item.id] || 0) <= 0}
                      >
                        Generate Order
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="modal-actions">
              <div className="order-summary">
                Total Items to Order: <strong>{totalItemsToOrder}</strong>
              </div>
              <div className="order-actions">
                <button className="modal-btn cancel-btn" onClick={handleOrderCancel}>
                  Cancel
                </button>
                <button className="modal-btn save-btn" onClick={handleGenerateOrder}>
                  Generate Order
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sell Modal Overlay */}
      {showSellModal && sellingTurbo && (
        <div className="modal-overlay" onClick={handleSellCancel}>
          <div className="modal sell-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="sell-icon">💰</div>
              <h2 className="modal-title">Sell Turbo</h2>
            </div>
            
            <div className="modal-form">
              <div className="sell-item-info">
                <div className="sell-item-details">
                  <div className="sell-item-id">ID: {sellingTurbo.id}</div>
                  <div className="sell-item-model">Model: {sellingTurbo.model}</div>
                  <div className="sell-item-location">Location: {sellingTurbo.location || sellingTurbo.bay}</div>
                  <div className="sell-item-stock">
                    Available Stock: <strong>{sellingTurbo.quantity}</strong>
                  </div>
                </div>
              </div>
              
              <div className="form-group">
                <label htmlFor="sellQuantity">Quantity to Sell</label>
                <div className="quantity-input-group">
                  <button 
                    className="quantity-btn minus-btn"
                    onClick={() => setSellQuantity(Math.max(1, sellQuantity - 1))}
                    disabled={sellQuantity <= 1}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    id="sellQuantity"
                    value={sellQuantity}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 1;
                      setSellQuantity(Math.max(1, Math.min(value, sellingTurbo.quantity)));
                    }}
                    className="quantity-input"
                    min="1"
                    max={sellingTurbo.quantity}
                  />
                  <button 
                    className="quantity-btn plus-btn"
                    onClick={() => setSellQuantity(Math.min(sellingTurbo.quantity, sellQuantity + 1))}
                    disabled={sellQuantity >= sellingTurbo.quantity}
                  >
                    +
                  </button>
                </div>
                {sellQuantity > sellingTurbo.quantity && (
                  <div className="error-message">
                    Not enough quantity to sell. Available: {sellingTurbo.quantity}
                  </div>
                )}
              </div>
            </div>
            
            <div className="modal-actions">
              <button className="modal-btn cancel-btn" onClick={handleSellCancel}>
                Cancel
              </button>
              <button 
                className="modal-btn save-btn" 
                onClick={handleSellConfirm}
                disabled={sellQuantity > sellingTurbo.quantity || sellQuantity <= 0}
              >
                Sell Turbo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Low Stock Modal Overlay */}
      {showLowStockModal && (
        <div className="modal-overlay" onClick={handleLowStockClose}>
          <div className="modal low-stock-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="low-stock-icon">⚠️</div>
              <h2 className="modal-title">Low Stock Items (≤1 Quantity)</h2>
            </div>
            
            <div className="modal-form">
              <div className="low-stock-items-list">
                {lowStockItems.map((item) => (
                  <div key={item.id} className="low-stock-item-card">
                    <div className="item-details">
                      <div className="item-id">{item.id}</div>
                      <div className="item-info">
                        <span>ID: {item.id}</span>
                        <span>Bay: {item.bay || item.location}</span>
                      </div>
                      <div className={`stock-status ${item.quantity === 0 ? 'out-of-stock' : 'low-stock'}`}>
                        {item.quantity === 0 ? 'OUT OF STOCK' : `${item.quantity} left`}
                      </div>
                    </div>
                  </div>
                ))}
                {lowStockItems.length === 0 && (
                  <div className="no-low-stock-message">
                    No low stock items found. All items have sufficient quantity.
                  </div>
                )}
              </div>
            </div>
            
            <div className="modal-actions">
              <button className="modal-btn cancel-btn" onClick={handleLowStockClose}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Orders Modal Overlay */}
      {showPendingModal && (
        <div className="modal-overlay" onClick={handlePendingClose}>
          <div className="modal pending-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="pending-icon">⏳</div>
              <h2 className="modal-title">Pending Orders</h2>
            </div>
            
            <div className="modal-form">
              <div className="pending-orders-list">
                {pendingOrders.length === 0 ? (
                  <div className="no-pending-message">
                    No pending orders found. Generate orders from the "Order Now" section.
                  </div>
                ) : (
                  pendingOrders.map((order) => (
                    <div key={order.id} className={`pending-order-card ${order.status}`}>
                      <div className="order-details">
                        <div className="order-id">{order.partNumber}</div>
                        <div className="order-info">
                          <span>Model: {order.model}</span>
                          <span>Location: {order.location}</span>
                          <span>Quantity: {order.quantity}</span>
                          <span>Order Date: {new Date(order.orderDate).toLocaleDateString()}</span>
                        </div>
                        <div className={`order-status ${order.status}`}>
                          {order.status === 'pending' ? '⏳ Pending' : '✅ Arrived'}
                        </div>
                      </div>
                      {order.status === 'pending' && (
                        <div className="order-actions">
                          <button 
                            className="modal-btn save-btn"
                            onClick={() => handleOrderArrived(order)}
                          >
                            Mark as Arrived
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
            
            <div className="modal-actions">
              <button className="modal-btn cancel-btn" onClick={handlePendingClose}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <ToastContainer />
    </div>
  );
}

export default App;
