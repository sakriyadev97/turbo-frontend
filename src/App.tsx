import React, { useState, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

interface TurboItem {
  id: string;
  model: string;
  displayText?: string; // Display text for complex items
  bay?: string; // Optional for backward compatibility
  location?: string; // Backend might return this
  quantity: number;
  isLowStock: boolean;
  priority?: boolean; // Priority flag
  allPartNumbers?: string[]; // Array of all part numbers for this item
  bigPartNumbers?: string[]; // Big variant part numbers
  smallPartNumbers?: string[]; // Small variant part numbers
  bigQuantity?: number; // Big variant quantity
  smallQuantity?: number; // Small variant quantity
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
  
  // State for bulk selection
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [bulkOrderQuantities, setBulkOrderQuantities] = useState<{[key: string]: number}>({});

  // API Base URL - Use deployed backend or fallback to localhost
  const API_BASE_URL =  'https://turbo-backend-henna.vercel.app/api';
  // const API_BASE_URL =  'http://localhost:5000/api';
  


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
        
        // Backend returns { turbos: [...] }
        const turbosArray = data.turbos || [];
        
        // Transform backend data to frontend format
        const transformedTurbos = turbosArray.map((turbo: any) => {
          
          // Handle different data structures
          if (turbo.hasSizeOption && turbo.sizeVariants) {
            // Big/Small variants - create single item with all variants
            const bigPartNumbers = (turbo.sizeVariants.big?.partNumbers || []).filter((pn: string) => pn && pn.trim());
            const smallPartNumbers = (turbo.sizeVariants.small?.partNumbers || []).filter((pn: string) => pn && pn.trim());
            
            // Calculate total quantity
            const bigQuantity = turbo.sizeVariants.big?.quantity || 0;
            const smallQuantity = turbo.sizeVariants.small?.quantity || 0;
            const totalQuantity = bigQuantity + smallQuantity;
            
            // Create display text
            let displayText = '';
            if (bigPartNumbers.length > 0) {
              displayText += `Big: ${bigPartNumbers.join(', ')}`;
            }
            if (smallPartNumbers.length > 0) {
              if (displayText) displayText += ' | ';
              displayText += `Small: ${smallPartNumbers.join(', ')}`;
            }
            
            if (displayText) {
              // Create a more descriptive model text that includes quantities
              let modelWithQuantities = '';
              if (bigPartNumbers.length > 0) {
                modelWithQuantities += `Big: ${bigPartNumbers.join(', ')} (Qty: ${bigQuantity})`;
              }
              if (smallPartNumbers.length > 0) {
                if (modelWithQuantities) modelWithQuantities += ' | ';
                modelWithQuantities += `Small: ${smallPartNumbers.join(', ')} (Qty: ${smallQuantity})`;
              }
              
              return [{
                id: [...bigPartNumbers, ...smallPartNumbers].join(', '), // Keep ID as just part numbers
                model: modelWithQuantities,
                displayText: displayText, // Add separate display text field
                location: turbo.location || 'No location',
                bay: turbo.location || 'No location',
                quantity: totalQuantity,
                isLowStock: isLowStockItem(totalQuantity, turbo.priority || false),
                priority: turbo.priority || false,
                allPartNumbers: [...bigPartNumbers, ...smallPartNumbers], // Keep all part numbers for operations
                bigPartNumbers: bigPartNumbers,
                smallPartNumbers: smallPartNumbers,
                bigQuantity: bigQuantity,
                smallQuantity: smallQuantity
              }];
            }
            return [];
          } else {
            // Regular turbo items - keep multiple part numbers together as one item
            const validPartNumbers = (turbo.partNumbers || []).filter((partNumber: string) => 
              partNumber && partNumber.trim()
            );
            
            if (validPartNumbers.length > 0) {
              return [{
                id: validPartNumbers.join(', '), // Join multiple part numbers with commas
                model: validPartNumbers.join(', '), // Display all part numbers together
                location: turbo.location || 'No location',
                  bay: turbo.location || 'No location', // For backward compatibility
                  quantity: turbo.quantity || 0,
                  isLowStock: isLowStockItem(turbo.quantity || 0, turbo.priority || false),
                priority: turbo.priority || false,
                allPartNumbers: validPartNumbers // Keep original array for operations
              }];
              }
            return [];
          }
        }).flat(); // Flatten the array of arrays
        
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
      const response = await fetch(`${API_BASE_URL}/all-pending-orders`);
      
      if (response.ok) {
        const data = await response.json();
        
        // Transform backend data to frontend format and filter out arrived orders
        const transformedOrders: PendingOrder[] = (data.pendingOrders || [])
          .filter((order: any) => order.status !== 'arrived') // Only show pending orders
          .map((order: any) => ({
          id: order._id,
          partNumber: order.partNumber,
          model: order.modelName, // Backend uses modelName
          location: order.location,
          quantity: order.quantity,
          orderDate: new Date(order.orderDate).toISOString(),
          status: order.status
        }));
        
        setPendingOrders(transformedOrders);
      } else {
        // Don't show error for 404 or 500 status codes as they might be normal
        if (response.status !== 404 && response.status !== 500) {
          toast.error('Failed to fetch pending orders');
        } else {
          setPendingOrders([]);
        }
      }
    } catch (error) {
      // Don't show error for network issues, just set empty array
      setPendingOrders([]);
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

      // Use the first part number for updating (since backend expects a single part number)
      const partNumberToUpdate = id.split(',')[0].trim();
      

      
      const response = await fetch(`${API_BASE_URL}/turbos/update-by-partnumber`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          partNumber: partNumberToUpdate,
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
      // For Big/Small variants, the id contains the display text like "Big: 99999, 99909 | Small: 22222, 121212"
      // We need to extract the first part number from either Big or Small variants
      let partNumberToDelete = '';
      
      if (id.includes('Big:') || id.includes('Small:')) {
        // This is a Big/Small variant, extract the first part number
        const bigMatch = id.match(/Big:\s*([^|]+)/);
        const smallMatch = id.match(/Small:\s*([^|]+)/);
        
        if (bigMatch) {
          // Extract first part number from Big variants
          const bigPartNumbers = bigMatch[1].split(',').map(pn => pn.trim());
          partNumberToDelete = bigPartNumbers[0];
        } else if (smallMatch) {
          // Extract first part number from Small variants
          const smallPartNumbers = smallMatch[1].split(',').map(pn => pn.trim());
          partNumberToDelete = smallPartNumbers[0];
        }
      } else {
        // Regular turbo, use the first part number
        partNumberToDelete = id.split(',')[0].trim();
      }
      
      const response = await fetch(`${API_BASE_URL}/turbos/delete-by-partnumber/${partNumberToDelete}`, {
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
      
      // Check if this is a Big/Small variant turbo
      const isBigSmallVariant = !!(editingTurbo.bigPartNumbers || editingTurbo.smallPartNumbers);
      
      if (isBigSmallVariant) {
        // Handle Big/Small variants
        setNewTurboForm({
          model: '',
          bay: editingTurbo.location || editingTurbo.bay || '',
          quantity: '',
          multipleModels: false,
          bigSmallVariants: true,
          priority: !!editingTurbo.priority,
          bigModels: editingTurbo.bigPartNumbers?.join(', ') || '',
          bigQuantity: editingTurbo.bigQuantity?.toString() || '0',
          smallModels: editingTurbo.smallPartNumbers?.join(', ') || '',
          smallQuantity: editingTurbo.smallQuantity?.toString() || '0'
        });
      } else {
        // Handle regular turbo
        const hasMultipleModels = !!(editingTurbo.allPartNumbers && editingTurbo.allPartNumbers.length > 1);
        
      setNewTurboForm({
        model: editingTurbo.model || '',
        bay: editingTurbo.location || editingTurbo.bay || '',
        quantity: editingTurbo.quantity?.toString() || '',
          multipleModels: hasMultipleModels,
        bigSmallVariants: false,
          priority: !!editingTurbo.priority,
        bigModels: '',
        bigQuantity: '0',
        smallModels: '',
        smallQuantity: '0'
      });
      }
    }
  }, [editingTurbo]);

  // Get low stock items for order modal
  const lowStockItems = Array.isArray(turboItems) ? turboItems.filter(item => item.isLowStock) : [];

  // Search functionality - only searches by turbo model name
  const filteredItems = Array.isArray(turboItems) ? turboItems.filter(item => {
    if (!searchTerm.trim()) return true;
    
    const searchLower = searchTerm.toLowerCase().trim();
    const modelName = (item.model || '').toLowerCase();
    const displayText = (item.displayText || '').toLowerCase();
    
    // Search only in model name and display text (which represents the turbo model)
    return modelName.includes(searchLower) || displayText.includes(searchLower);
  }) : [];


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
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
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
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setNewTurboForm(prev => {
      const newState = {
      ...prev,
      [name]: type === 'checkbox' ? checked : value
      };
      return newState;
    });
  };

  const handleSaveTurbo = () => {
    // Prevent execution if modal is not open
    if (!showModal) {
      return;
    }
    
    // Check if bay/location is filled
    if (!newTurboForm.bay.trim()) {
      toast.error('Please enter bay location');
      return;
    }
    
    // Check validation based on form type
    if (newTurboForm.bigSmallVariants) {
      // Big/Small variants validation
      if (!newTurboForm.bigModels.trim() && !newTurboForm.smallModels.trim()) {
        toast.error('Please enter at least one model name (big or small)');
        return;
      }
      
      // Check quantities for entered models
      if (newTurboForm.bigModels.trim() && (!newTurboForm.bigQuantity || parseInt(newTurboForm.bigQuantity) < 0)) {
        toast.error('Please enter a valid big quantity');
        return;
      }
      
      if (newTurboForm.smallModels.trim() && (!newTurboForm.smallQuantity || parseInt(newTurboForm.smallQuantity) < 0)) {
        toast.error('Please enter a valid small quantity');
        return;
      }
    } else {
      // Regular form validation
      if (!newTurboForm.model.trim()) {
        toast.error('Please enter model name(s)');
      return;
    }
    
    // Check if quantity is filled
      if (!newTurboForm.quantity || parseInt(newTurboForm.quantity) < 0) {
      toast.error('Please enter a valid quantity');
      return;
      }
    }

    // Convert model string to array if multiple models
    const modelArray = newTurboForm.multipleModels 
      ? newTurboForm.model.split(',').map(m => m.trim()).filter(m => m.length > 0)
      : [newTurboForm.model];

    const turboData: any = {
      location: newTurboForm.bay, // Changed from 'bay' to 'location' to match backend
      hasSizeOption: newTurboForm.bigSmallVariants, // Backend expects this field name
      priority: newTurboForm.priority, // Add priority flag
    };

    // Only add quantity for regular form (not Big/Small variants)
    if (!newTurboForm.bigSmallVariants) {
      turboData.quantity = parseInt(newTurboForm.quantity);
    }

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
    // Clear bulk selections
    setSelectedItems(new Set());
    setBulkOrderQuantities({});
    // Clean up temporary bulk items
    setTurboItems(prev => prev.filter(item => !item.id.startsWith('BULK_')));
  };

  // Bulk selection handlers
  const handleItemSelect = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
      const newBulkQuantities = { ...bulkOrderQuantities };
      delete newBulkQuantities[itemId];
      setBulkOrderQuantities(newBulkQuantities);
    } else {
      newSelected.add(itemId);
      // Set default quantity to 1 for bulk orders
      setBulkOrderQuantities(prev => ({ ...prev, [itemId]: 1 }));
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedItems.size === filteredItems.length) {
      // Deselect all
      setSelectedItems(new Set());
      setBulkOrderQuantities({});
    } else {
      // Select all
      const allIds = new Set(filteredItems.map(item => item.id));
      setSelectedItems(allIds);
      const newQuantities: {[key: string]: number} = {};
      filteredItems.forEach(item => {
        newQuantities[item.id] = 1;
      });
      setBulkOrderQuantities(newQuantities);
    }
  };

  const handleBulkQuantityChange = (itemId: string, quantity: number) => {
    setBulkOrderQuantities(prev => ({
      ...prev,
      [itemId]: Math.max(0, quantity)
    }));
  };



  // Create a pending order
  const createPendingOrder = async (orderData: { partNumber: string; modelName: string; location: string; quantity: number }) => {
    const response = await fetch(`${API_BASE_URL}/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderData)
    });

    if (!response.ok) {
      throw new Error('Failed to create pending order');
    }

    return await response.json();
  };



  const handleBulkOrderConfirm = async () => {
    const selectedItemsArray = Array.from(selectedItems);
    let successCount = 0;
    let failCount = 0;
    const allOrdersForEmail: any[] = [];

    // First, create all pending orders and collect them for bulk email
    for (const itemId of selectedItemsArray) {
      const quantity = bulkOrderQuantities[itemId] || 1; // Default to 1 if not set
      if (quantity <= 0) {
        console.log(`Skipping item ${itemId} with invalid quantity: ${quantity}`);
        continue;
      }

      const item = turboItems.find(t => t.id === itemId);
      if (!item) {
        console.log(`Item not found for ID: ${itemId}`);
        continue;
      }
      console.log('Processing item:', item);

      try {
        // Handle regular single items (simplified logic)
        const firstPartNumber = item.allPartNumbers?.[0] || 
                               item.bigPartNumbers?.[0] || 
                               item.smallPartNumbers?.[0] || 
                               item.id.split(',')[0].trim();

        // Extract clean model name from display text
        let cleanModel = firstPartNumber; // Default to part number
        if (item.model && !item.model.includes('Big:') && !item.model.includes('Small:')) {
          // If it's a regular model (not Big/Small variant), use the first part number
          cleanModel = item.allPartNumbers?.[0] || item.id.split(',')[0].trim();
        }

        // Debug logging
        console.log('Creating pending order with data:', {
          partNumber: firstPartNumber,
          modelName: cleanModel,
          location: item.location || item.bay || '',
          quantity: quantity
        });

        await createPendingOrder({
          partNumber: firstPartNumber,
          modelName: cleanModel,
          location: item.location || item.bay || 'Unknown Location',
          quantity: quantity
        });

        // Add to bulk email collection
        allOrdersForEmail.push({
          partNumber: firstPartNumber,
          modelName: cleanModel,
          location: item.location || item.bay || 'Unknown Location',
          quantity: quantity
        });

        successCount++;
      } catch (error) {
        failCount++;
      }
    }

    // Send single bulk email with PDF if we have successful orders
    if (successCount > 0 && allOrdersForEmail.length > 0) {
      try {
        const orderNumber = `BO-${Date.now()}`;
        console.log('Sending bulk order email with PDF for orders:', allOrdersForEmail);
        await sendBulkOrderEmailWithPDF(allOrdersForEmail, orderNumber);
        toast.success(`Successfully created ${successCount} bulk orders and sent consolidated PDF invoice!`);
      } catch (emailError) {
        console.error('Failed to send bulk email:', emailError);
        toast.warning(`Orders created successfully, but failed to send bulk email: ${emailError}`);
      }
      await fetchPendingOrders();
    }
    
    if (failCount > 0) {
      toast.error(`Failed to create ${failCount} orders`);
    }

    // Clear selections
    setSelectedItems(new Set());
    setBulkOrderQuantities({});
    setShowOrderModal(false);
  };

  const sendBulkOrderEmailWithPDF = async (orders: any[], orderNumber: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/email/send-bulk-order-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orders: orders,
          orderNumber: orderNumber
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send bulk order email');
      }

      const result = await response.json();
      return result;
    } catch (error) {
      throw error;
    }
  };

  const handleRemoveBulkItem = (itemId: string) => {
    // Remove from selected items
    const newSelected = new Set(selectedItems);
    newSelected.delete(itemId);
    setSelectedItems(newSelected);

    // Remove from quantities
    const newQuantities = { ...bulkOrderQuantities };
    delete newQuantities[itemId];
    setBulkOrderQuantities(newQuantities);

    // Remove from turboItems if it's a bulk item
    if (itemId.startsWith('BULK_')) {
      setTurboItems(prev => prev.filter(item => item.id !== itemId));
    }
  };

  const handleIndividualGenerateOrder = async (item: TurboItem) => {
    const quantity = orderQuantities[item.id] || 0;
    if (quantity <= 0) {
      toast.error('Please select a quantity to order');
      return;
    }

    try {
      const orderData = {
        partNumber: item.id,
        modelName: item.model,
        location: item.location || item.bay || 'Unknown',
        quantity
      };
      
      // Create order in the backend
      const response = await fetch(`${API_BASE_URL}/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData)
      });

      if (response.ok) {
        const result = await response.json();
        
        // Clear this item's quantity from the form
        setOrderQuantities(prev => {
          const updated = { ...prev };
          delete updated[item.id];
          return updated;
        });
        
        // Send order email for this individual order
        await sendOrderEmail([orderData]);
        
        // Refresh pending orders from backend
        await fetchPendingOrders();
        
        toast.success(`Generated order for ${item.model} (${quantity} units) and added to pending list!`);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to create pending order');
      }
    } catch (error) {
      toast.error('Network error while creating pending order');
    }
  };

  const sendOrderEmail = async (orders: any[]) => {
    try {
      // Create email body with order details
      const orderDetails = orders.map(order => 
        `- Model: ${order.modelName}, Quantity: ${order.quantity}, Location: ${order.location}`
      ).join('\n');
      
      const emailBody = `Please order the following items:\n\n${orderDetails}\n\nThank you!`;
      
      // Send email via backend
      const emailResponse = await fetch(`${API_BASE_URL}/email/send-order-email-with-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: 'New Turbo Order Request',
          body: emailBody,
          orders: orders
        })
      });
      
      if (emailResponse.ok) {
        const result = await emailResponse.json();
        toast.success('Order email sent successfully!');
      } else {
        const error = await emailResponse.json();
        toast.error(`Failed to send order email: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      toast.error('Network error while sending order email');
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
        fetch(`${API_BASE_URL}/create-order`, {
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
        
        // Send order email
        await sendOrderEmail(ordersToCreate);
        
        setShowOrderModal(false);
        setOrderQuantities({});
        
        // Refresh pending orders from backend
        await fetchPendingOrders();
      } else {
        toast.error(`Failed to create ${failedResponses.length} order(s)`);
      }
    } catch (error) {
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
    
    // Check if bay/location is filled
    if (!newTurboForm.bay.trim()) {
      toast.error('Please enter bay location');
      return;
    }
    
    // Check validation based on form type
    if (newTurboForm.bigSmallVariants) {
      // Big/Small variants validation
      if (!newTurboForm.bigModels.trim() && !newTurboForm.smallModels.trim()) {
        toast.error('Please enter at least one model name (big or small)');
        return;
      }
      
      // Check quantities for entered models
      if (newTurboForm.bigModels.trim() && (!newTurboForm.bigQuantity || parseInt(newTurboForm.bigQuantity) < 0)) {
        toast.error('Please enter a valid big quantity');
        return;
      }
      
      if (newTurboForm.smallModels.trim() && (!newTurboForm.smallQuantity || parseInt(newTurboForm.smallQuantity) < 0)) {
        toast.error('Please enter a valid small quantity');
        return;
      }
    } else {
      // Regular form validation
      if (!newTurboForm.model.trim()) {
        toast.error('Please enter model name(s)');
      return;
    }
    
    // Check if quantity is filled
      if (!newTurboForm.quantity || parseInt(newTurboForm.quantity) < 0) {
      toast.error('Please enter a valid quantity');
      return;
      }
    }

    // Convert model string to array if multiple models
    const modelArray = newTurboForm.multipleModels 
      ? newTurboForm.model.split(',').map(m => m.trim()).filter(m => m.length > 0)
      : [newTurboForm.model];

    const updateData: any = {
      location: newTurboForm.bay,
      hasSizeOption: newTurboForm.bigSmallVariants,
      priority: newTurboForm.priority, // Add priority flag
    };

    // Only add quantity for regular form (not Big/Small variants)
    if (!newTurboForm.bigSmallVariants) {
      updateData.quantity = parseInt(newTurboForm.quantity);
    }

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
    setShowLowStockModal(true);
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
      // Extract the first part number for multiple models (e.g., "1234, 5674" -> "1234")
      const partNumberToUpdate = order.partNumber.split(',')[0].trim();
      
      // First, update the turbo quantity in the backend
      const turboResponse = await fetch(`${API_BASE_URL}/turbos/update-by-partnumber`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          partNumber: partNumberToUpdate,
          quantity: order.quantity,
          operation: 'add' // Add the ordered quantity to existing stock
        })
      });
      
      if (turboResponse.ok) {
        const turboResult = await turboResponse.json();
        
        // Now mark the pending order as arrived in the backend
        const orderResponse = await fetch(`${API_BASE_URL}/${order.id}/arrived`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          }
        });
        
        if (orderResponse.ok) {
          const orderResult = await orderResponse.json();
          
          // Refresh pending orders from backend
          await fetchPendingOrders();
          
          // Add a small delay to ensure backend has processed the quantity update
          setTimeout(() => {
            refreshData();
          }, 500);
          
          toast.success(`Order for ${order.model} marked as arrived! Quantity added to stock.`);
        } else {
          const error = await orderResponse.json();
          toast.error(error.error || 'Failed to update order status');
        }
      } else {
        const error = await turboResponse.json();
        toast.error(error.error || 'Failed to update turbo quantity');
      }
    } catch (error) {
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
        // Call the new sell API endpoint
        const response = await fetch(`${API_BASE_URL}/turbos/sell`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
          partNumber: sellingTurbo.bigPartNumbers?.[0] || sellingTurbo.smallPartNumbers?.[0] || sellingTurbo.id.split(',')[0].trim(), // Use first part number for selling
            quantity: sellQuantity
          })
        });
        
        if (response.ok) {
          const result = await response.json();
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
          if (error.error === 'Not enough quantity to sell') {
            toast.error(`Not enough quantity to sell. Available: ${error.available}, Requested: ${error.requested}`);
          } else {
            toast.error(error.error || error.message || 'Failed to sell turbo');
          }
        }
      } catch (error) {
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
            placeholder="Search by turbo model name..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
            }}
            className="search-input"
          />
          <span className="search-icon">🔍</span>
          {searchTerm && (
            <button 
              className="clear-search-btn" 
              onClick={() => setSearchTerm('')}
              style={{ marginLeft: '10px', padding: '5px 10px', background: '#ff6b6b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Clear
            </button>
          )}
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

      {/* Search Results Info */}
      {searchTerm && (
        <div style={{ margin: '20px 0', padding: '10px', background: '#f0f0f0', borderRadius: '8px', textAlign: 'center' }}>
          <strong>Search Results:</strong> Found {filteredItems.length} items matching "{searchTerm}"
        </div>
      )}

      {/* Turbo Items Grid */}
      <div className="turbo-grid">
        {filteredItems.map((item) => (
          <div key={item.id || 'unknown'} className="turbo-card">
            <div className="turbo-id">#{item.id || 'Unknown'}</div>
            <div className="turbo-model">{item.displayText || item.model || 'Unknown Model'}</div>
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
                <strong>Individual Orders:</strong> Use +/- buttons to select quantities and click 'Generate Order' for individual items.<br/>
                <strong>Bulk Orders:</strong> Check multiple items and use 'Create Bulk Order' for consolidated PDF invoice.
              </div>



              <div className="bulk-selection-controls-modal">
                <button 
                  className="bulk-select-btn"
                  onClick={handleSelectAll}
                >
                  {selectedItems.size === filteredItems.length && filteredItems.length > 0 ? 
                    '☑️ Deselect All' : 
                    '☐ Select All'
                  }
                </button>
                {selectedItems.size > 0 && (
                  <span className="selection-count">
                    {selectedItems.size} selected for bulk order
                  </span>
                )}
              </div>
              
              <div className="order-items-list">
                {lowStockItems.map((item) => (
                  <div key={item.id} className="order-item-card low-stock-item">
                    <div className="item-selection">
                      <input
                        type="checkbox"
                        className="bulk-select-checkbox"
                        checked={selectedItems.has(item.id)}
                        onChange={() => handleItemSelect(item.id)}
                      />
                    </div>
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
                {selectedItems.size > 0 && (
                  <button 
                    className="modal-btn save-btn bulk-order-btn" 
                    onClick={handleBulkOrderConfirm}
                  >
                    Create Bulk Order ({selectedItems.size} items)
                </button>
                )}
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
