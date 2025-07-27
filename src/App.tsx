import React, { useState } from 'react';
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
}

interface NewTurboForm {
  model: string;
  bay: string;
  quantity: string;
  multipleModels: boolean;
  bigSmallVariants: boolean;
  bigModels: string;
  bigQuantity: string;
  smallModels: string;
  smallQuantity: string;
}

interface LoginForm {
  username: string;
  password: string;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTurbo, setEditingTurbo] = useState<TurboItem | null>(null);
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
    bigModels: '',
    bigQuantity: '0',
    smallModels: '',
    smallQuantity: '0'
  });
  
  // State for order quantities
  const [orderQuantities, setOrderQuantities] = useState<{[key: string]: number}>({});

  // API Base URL - Use deployed backend or fallback to localhost
  const API_BASE_URL =  'https://turbo-backend-henna.vercel.app/api';
  
  // Debug log to check which URL is being used
  console.log('API_BASE_URL:', API_BASE_URL);

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
                    isLowStock: (turbo.sizeVariants.big.quantity || 0) <= 1
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
                    isLowStock: (turbo.sizeVariants.small.quantity || 0) <= 1
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
                  isLowStock: (turbo.quantity || 0) <= 1
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
          bigModels: '',
          bigQuantity: '0',
          smallModels: '',
          smallQuantity: '0'
        });
        fetchAllTurbos(); // Refresh all data instead of adding raw response
        fetchTurboStats(); // Refresh stats
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
        fetchAllTurbos(); // Refresh all data
        fetchTurboStats(); // Refresh stats
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
        setTurboItems(prev => Array.isArray(prev) ? prev.filter(item => item.id !== id) : []);
        toast.success('Turbo deleted successfully!');
        fetchTurboStats(); // Refresh stats
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to delete turbo');
      }
    } catch (error) {
      console.error('Error deleting turbo:', error);
      toast.error('Network error while deleting turbo');
    }
  };

  const sellTurbo = async (id: string) => {
    if (!id) {
      toast.error('Invalid item ID');
      return;
    }
    
    const item = Array.isArray(turboItems) ? turboItems.find(item => item.id === id) : undefined;
    if (!item || item.quantity <= 0) {
      toast.error('Cannot sell: Item out of stock');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/turbos/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quantity: item.quantity - 1
        })
      });

      if (response.ok) {
        const updatedTurbo = await response.json();
        setTurboItems(prev => Array.isArray(prev) ? prev.map(item => 
          item.id === id ? updatedTurbo : item
        ) : []);
        toast.success('Turbo sold successfully!');
        fetchTurboStats(); // Refresh stats
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to sell turbo');
      }
    } catch (error) {
      console.error('Error selling turbo:', error);
      toast.error('Network error while selling turbo');
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
      setNewTurboForm({
        model: editingTurbo.model || '',
        bay: editingTurbo.location || editingTurbo.bay || '',
        quantity: editingTurbo.quantity?.toString() || '',
        multipleModels: false,
        bigSmallVariants: false,
        bigModels: '',
        bigQuantity: '0',
        smallModels: '',
        smallQuantity: '0'
      });
    }
  }, [editingTurbo]);

  // Get low stock items for order modal
  const lowStockItems = Array.isArray(turboItems) ? turboItems.filter(item => item.isLowStock || item.quantity <= 2) : [];

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

  const handleGenerateOrder = () => {
    // Here you would typically generate and download the order document
    console.log('Generating order with quantities:', orderQuantities);
    setShowOrderModal(false);
    setOrderQuantities({});
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

  const resetForm = () => {
    setNewTurboForm({
      model: '',
      bay: '',
      quantity: '',
      multipleModels: false,
      bigSmallVariants: false,
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
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="card-number">{totalItems}</div>
          <div className="card-label">Total Items</div>
        </div>
        <div className="summary-card clickable">
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
                onClick={() => sellTurbo(item.id || '')}
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
                            <div className={`quantity-badge ${item.quantity === 0 ? 'out-of-stock' : item.quantity <= 1 ? 'low-stock' : 'in-stock'}`}>
              {item.quantity}
            </div>
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
              <h2 className="modal-title">Create Purchase Order - Low Stock Items</h2>
            </div>
            
            <div className="modal-form">
              <div className="instructions-box">
                <strong>Instructions:</strong> Use +/- buttons to select quantities to order for each low stock item. Click 'Generate Order' to create a printable document.
              </div>
              
              <div className="order-items-list">
                {lowStockItems.map((item) => (
                  <div key={item.id} className="order-item-card">
                    <div className="item-details">
                      <div className="item-id">{item.id}</div>
                      <div className="item-info">
                        <span>ID: {item.id}</span>
                        <span>Bay: {item.bay}</span>
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
      <ToastContainer />
    </div>
  );
}

export default App;
