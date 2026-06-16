import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Activity,
    Gauge,
    ShieldAlert,
    AlertTriangle,
    LineChart as ChartIcon,
    Settings,
    Edit2,
    Anchor,
    LogOut,
    ChevronDown,
    Map,
    ArrowDownToLine,
    Zap
} from 'lucide-react';
import {
    Box,
    AppBar,
    Toolbar,
    Typography,
    IconButton,
    CssBaseline,
    Dialog,
    DialogTitle,
    DialogContent,
    TextField,
    DialogActions,
    Button,
    Popover,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Divider
} from '@mui/material';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const menuItems = [
    { text: 'Rig Overview', icon: <LayoutDashboard size={20} />, path: '/' },
    { text: 'EDR', icon: <Activity size={20} />, path: '/edr' },
    { text: 'Engine & Power', icon: <Gauge size={20} />, path: '/engine' },
    { text: 'Well Control', icon: <ShieldAlert size={20} />, path: '/wellcontrol' },
    { text: 'Allison Trans', icon: <Zap size={20} />, path: '/allison' },
    { text: 'Fishing Ops', icon: <Anchor size={20} />, path: '/fishing' },
    { text: 'Live Trends', icon: <ChartIcon size={20} />, path: '/trends' },
    { text: 'Settings', icon: <Settings size={20} />, path: '/admin' },
];

import { useRig } from '../../context/RigContext';

export default function Layout() {
    const location = useLocation();
    const { logout, user } = useAuth();
    const { socket, apiBaseUrl, currentRig, setCurrentRig, globalRigData, alarmEnabled, setAlarmEnabled } = useRig();
    const navigate = useNavigate();
    const isViewer = user?.role === 'viewer';

    const [menuAnchor, setMenuAnchor] = useState(null);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // Well & Rig State
    const [wellInfo, setWellInfo] = useState({ well: 'WELL-001', rig: 'RIG-ALPHA' });
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [tempInfo, setTempInfo] = useState({ well: '', rig: '' });

    // Drilling Metrics State
    const [rigData, setRigData] = useState({ wob: 0, bit_depth: 0, hole_depth: 0, block_position: 0 });
    const [units, setUnits] = useState({ depth: 'ft' });
    const [isDrillingDialogOpen, setIsDrillingDialogOpen] = useState(false);
    const [calibrationValues, setCalibrationValues] = useState({ bitDepth: '', holeDepth: '' });
    
    // Real-time Alarm monitoring and Alert Popup
    const [activeAlarms, setActiveAlarms] = useState([]);

    const playAlarmBeep = () => {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
            gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);

            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            oscillator.start();
            setTimeout(() => {
                oscillator.stop();
                audioCtx.close();
            }, 150);
        } catch (e) {
            console.warn("Web Audio API blocked or not supported:", e);
        }
    };

    useEffect(() => {
        if (!globalRigData || !alarmEnabled) {
            if (activeAlarms.length > 0) {
                setActiveAlarms([]);
            }
            return;
        }

        const d = globalRigData.drawworks || {};
        const e = globalRigData.engine || {};
        const m = globalRigData.mudpump || {};
        const dr = globalRigData.drilling || {};
        const w = globalRigData.well_control || {};
        const f = globalRigData.fluid || {};
        const s = globalRigData.system || {};

        const currentValues = {
            hook_load: d.hook_load || 0,
            block_position: d.block_position || 0,
            engine_rpm: e.rpm || 0,
            oil_pressure: e.oil_pressure || 0,
            oil_temp: e.oil_temp || 0,
            coolant_temp: e.coolant_temp || 0,
            fuel_level: e.fuel_level || 0,
            battery_voltage: e.battery_voltage || 0,
            pump_pressure: m.pressure || 0,
            torque: e.torque || 0,
            flow_in: m.flow_in || 0,
            flow_out: m.flow_out || 0,
            spm1: m.spm || 0,
            spm2: m.spm_2 || 0,
            total_spm: m.total_spm || 0,
            total_strokes: m.total_strokes || 0,
            trip_tank: f.trip_tank || d.trip_tank || 0,
            rig_air_pressure: s.rig_air_pressure || d.rig_air_pressure || 0,
            annular_pressure: w.annular_pressure || 0,
            accumulator_pressure: w.accumulator_pressure || 0,
            manifold_pressure: w.manifold_pressure || 0,
            wob: dr.wob || 0,
            gain_loss: f.gain_loss || 0
        };

        const METRIC_KEYS = [
            { key: 'hook_load', label: 'Hook Load', unit: 'ton' },
            { key: 'wob', label: 'WOB', unit: 'ton' },
            { key: 'pump_pressure', label: 'Standpipe Pressure', unit: 'PSI' },
            { key: 'engine_rpm', label: 'Engine RPM', unit: 'RPM' },
            { key: 'oil_pressure', label: 'Oil Pressure', unit: 'psi' },
            { key: 'oil_temp', label: 'Oil Temp', unit: '°C' },
            { key: 'coolant_temp', label: 'Coolant Temp', unit: '°C' },
            { key: 'fuel_level', label: 'Fuel Level', unit: '%' },
            { key: 'battery_voltage', label: 'Battery Voltage', unit: 'V' },
            { key: 'spm1', label: 'Pump 1 SPM', unit: 'spm' },
            { key: 'spm2', label: 'Pump 2 SPM', unit: 'spm' },
            { key: 'total_spm', label: 'Total SPM', unit: 'spm' },
            { key: 'total_strokes', label: 'Total Strokes', unit: 'strokes' },
            { key: 'trip_tank', label: 'Trip Tank', unit: 'm³' },
            { key: 'flow_rate', label: 'Flow Rate', unit: 'gpm' },
            { key: 'flow_out', label: 'Flow Out', unit: '%' },
            { key: 'gain_loss', label: 'Gain/Loss', unit: '%' },
            { key: 'annular_pressure', label: 'Annular Pressure', unit: 'PSI' },
            { key: 'accumulator_pressure', label: 'Accumulator Pressure', unit: 'PSI' },
            { key: 'manifold_pressure', label: 'Manifold Pressure', unit: 'PSI' },
            { key: 'torque', label: 'Rotary Torque', unit: 'ft-lbs' },
            { key: 'rig_air_pressure', label: 'Rig Air Pressure', unit: 'PSI' }
        ];

        const detected = [];

        METRIC_KEYS.forEach(({ key, label, unit }) => {
            const value = currentValues[key];
            if (value === undefined) return;

            const saved = localStorage.getItem(`romi_metric_cfg_${key}`);
            if (saved) {
                try {
                    const cfg = JSON.parse(saved);
                    let activeAlarm = null;

                    if (cfg.highHighAlarm !== undefined && cfg.highHighAlarm !== "" && value >= Number(cfg.highHighAlarm)) {
                        activeAlarm = { level: 'CRITICAL', msg: `exceeded Critical High threshold`, limit: cfg.highHighAlarm, isHigh: true };
                    } else if (cfg.highAlarm !== undefined && cfg.highAlarm !== "" && value >= Number(cfg.highAlarm)) {
                        activeAlarm = { level: 'WARNING', msg: `exceeded Warning High threshold`, limit: cfg.highAlarm, isHigh: true };
                    } else if (cfg.lowLowAlarm !== undefined && cfg.lowLowAlarm !== "" && value <= Number(cfg.lowLowAlarm)) {
                        activeAlarm = { level: 'CRITICAL', msg: `dropped below Critical Low threshold`, limit: cfg.lowLowAlarm, isHigh: false };
                    } else if (cfg.lowAlarm !== undefined && cfg.lowAlarm !== "" && value <= Number(cfg.lowAlarm)) {
                        activeAlarm = { level: 'WARNING', msg: `dropped below Warning Low threshold`, limit: cfg.lowAlarm, isHigh: false };
                    }

                    if (activeAlarm) {
                        detected.push({
                            key,
                            label: cfg.label || label,
                            level: activeAlarm.level,
                            msg: activeAlarm.msg,
                            value: Number(value).toFixed(1),
                            limit: Number(activeAlarm.limit).toFixed(1),
                            unit: cfg.unit || unit,
                            hornEnabled: !!cfg.hornEnabled,
                            id: `${key}_${activeAlarm.level}`
                        });
                    }
                } catch (e) {
                    console.warn("Error parsing metric config", e);
                }
            }
        });

        setActiveAlarms(prev => {
            detected.forEach(d => {
                const alreadyExists = prev.some(p => p.id === d.id);
                if (!alreadyExists) {
                    if (d.hornEnabled) {
                        playAlarmBeep();
                        setTimeout(playAlarmBeep, 200);
                    }
                }
            });
            return detected;
        });

    }, [globalRigData, alarmEnabled]);


    useEffect(() => {
        if (globalRigData) {
            setRigData({
                wob: globalRigData.drilling?.wob ?? 0,
                bit_depth: globalRigData.drilling?.bit_depth ?? 0,
                hole_depth: globalRigData.drilling?.hole_depth ?? 0,
                block_position: globalRigData.drawworks?.block_position ?? 0
            });
        }
    }, [globalRigData]);

    useEffect(() => {
        // Initial Load
        const layoutUrl = `${apiBaseUrl}/api/dashboard/layout?t=${Date.now()}`;
        console.log(`[Layout] Fetching operation info from: ${layoutUrl}`);

        fetch(layoutUrl)
            .then(res => res.json())
            .then(config => {
                if (config.wellInfo && config.wellInfo.well !== tempInfo.well) {
                    console.log("[Layout] Received operation info:", config.wellInfo);
                    setWellInfo(config.wellInfo);
                }
                if (config.units) setUnits(config.units);
            })
            .catch(err => console.error("[Layout] Failed to load rig info:", err));

        if (!socket) {
            console.warn("[Layout] Socket not available during effect initialization.");
            return;
        }

        // Real-time Updates
        const handleLayoutUpdate = (config) => {
            console.log("[Layout] Received real-time layout update:", config);
            if (config.wellInfo && (config.wellInfo.well !== wellInfo.well || config.wellInfo.rig !== wellInfo.rig)) {
                setWellInfo(config.wellInfo);
            }
        };

        console.log("[Layout] Registering 'dashboard_layout_update' listener");
        socket.on('dashboard_layout_update', handleLayoutUpdate);

        return () => {
            if (socket) {
                console.log("[Layout] Unregistering 'dashboard_layout_update' listener");
                socket.off('dashboard_layout_update', handleLayoutUpdate);
            }
        };
    }, [apiBaseUrl, socket]);

    useEffect(() => {
        if (location.pathname === '/admin' && isViewer) {
            navigate('/');
        }
    }, [location.pathname, isViewer, navigate]);

    const handleEditClick = () => {
        setTempInfo(wellInfo);
        setIsDialogOpen(true);
    };

    const handleSaveInfo = () => {
        setWellInfo(tempInfo);
        // Save to Backend (Partial Update)
        fetch(`${apiBaseUrl}/api/dashboard/layout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wellInfo: tempInfo })
        }).catch(e => console.error("Failed to save rig info", e));

        setIsDialogOpen(false);
    };

    const handleMenuOpen = (event) => {
        setMenuAnchor(event.currentTarget);
    };

    const handleMenuClose = () => {
        setMenuAnchor(null);
    };

    const handleNavClick = (path) => {
        navigate(path);
        setMenuAnchor(null);
    };

    const currentPage = menuItems.find(item => item.path === location.pathname);

    const formatDepth = (val) => {
        if (units.depth === 'm') return (val * 0.3048).toFixed(1);
        return val.toFixed(1);
    };

    const handleSetDepth = async () => {
        try {
            let bitDepth = calibrationValues.bitDepth ? Number(calibrationValues.bitDepth) : undefined;
            let holeDepth = calibrationValues.holeDepth ? Number(calibrationValues.holeDepth) : undefined;

            if (units.depth === 'm') {
                if (bitDepth !== undefined) bitDepth = bitDepth / 0.3048;
                if (holeDepth !== undefined) holeDepth = holeDepth / 0.3048;
            }

            await fetch(`${apiBaseUrl}/api/drilling/set-depth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bitDepth, holeDepth })
            });

            // Update units globally if needed (though units are usually fetched on reload)
            setIsDrillingDialogOpen(false);
        } catch (e) {
            console.error(e);
            alert("Failed to Set Depth");
        }
    };

    const handleUnitToggle = () => {
        const next = units.depth === 'ft' ? 'm' : 'ft';
        const newUnits = { ...units, depth: next };
        setUnits(newUnits);
        fetch(`${apiBaseUrl}/api/dashboard/layout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ units: newUnits })
        }).catch(e => console.error("Failed to save units", e));
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <CssBaseline />

            {/* Top AppBar */}
            <AppBar
                position="fixed"
                sx={{
                    bgcolor: '#0f172a',
                    borderBottom: '1px solid #334155',
                    boxShadow: 'none'
                }}
            >
                <Toolbar>
                    {/* Navigation Dropdown Button */}
                    <Button
                        onClick={handleMenuOpen}
                        sx={{
                            color: 'white',
                            textTransform: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            px: 2,
                            py: 0.8,
                            mr: 2,
                            borderRadius: 1,
                            bgcolor: menuAnchor ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.05)',
                            border: '1px solid #334155',
                            '&:hover': { bgcolor: 'rgba(56, 189, 248, 0.1)', borderColor: '#38bdf8' }
                        }}
                    >
                        {currentPage?.icon}
                        <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                            {currentPage?.text || 'Rig Overview'}
                        </Typography>
                        <ChevronDown size={16} style={{ transform: menuAnchor ? 'rotate(180deg)' : 'rotate(0deg)', transition: '0.2s' }} />
                    </Button>

                    {/* Alarm Toggle Button */}
                    <Button
                        onClick={() => setAlarmEnabled(!alarmEnabled)}
                        sx={{
                            color: alarmEnabled ? '#0f172a' : '#94a3b8',
                            borderColor: alarmEnabled ? '#e2e8f0' : '#334155',
                            bgcolor: alarmEnabled ? '#f8fafc' : 'rgba(255, 255, 255, 0.05)',
                            textTransform: 'uppercase',
                            fontWeight: 'bold',
                            px: 1.2,
                            py: 0.4,
                            mr: 2,
                            border: '1px solid',
                            borderRadius: 1,
                            transition: 'all 0.2s ease',
                            fontSize: '0.72rem',
                            '&:hover': {
                                bgcolor: alarmEnabled ? '#f1f5f9' : 'rgba(255, 255, 255, 0.1)',
                                borderColor: alarmEnabled ? '#cbd5e1' : '#475569',
                            }
                        }}
                    >
                        {alarmEnabled ? 'ALARM ENABLED' : 'ALARM DISABLED'}
                    </Button>

                    {/* Dropdown Menu */}
                    <Popover
                        open={Boolean(menuAnchor)}
                        anchorEl={menuAnchor}
                        onClose={handleMenuClose}
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                        PaperProps={{
                            sx: {
                                bgcolor: '#1e293b',
                                border: '1px solid #334155',
                                borderRadius: 2,
                                minWidth: 220,
                                mt: 0.5,
                                boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
                            }
                        }}
                    >
                        <List sx={{ py: 0.5 }}>
                            {menuItems.filter(item => !(isViewer && item.path === '/admin')).map((item) => {
                                const isActive = location.pathname === item.path;
                                return (
                                    <ListItem key={item.text} disablePadding>
                                        <ListItemButton
                                            onClick={() => handleNavClick(item.path)}
                                            sx={{
                                                px: 2, py: 1,
                                                bgcolor: isActive ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                                                borderLeft: isActive ? '3px solid #38bdf8' : '3px solid transparent',
                                                '&:hover': { bgcolor: 'rgba(56, 189, 248, 0.08)' }
                                            }}
                                        >
                                            <ListItemIcon sx={{ color: isActive ? '#38bdf8' : '#94a3b8', minWidth: 36 }}>
                                                {item.icon}
                                            </ListItemIcon>
                                            <ListItemText
                                                primary={item.text}
                                                primaryTypographyProps={{
                                                    sx: { color: isActive ? '#38bdf8' : 'white', fontWeight: isActive ? 'bold' : 'normal', fontSize: 14 }
                                                }}
                                            />
                                        </ListItemButton>
                                    </ListItem>
                                );
                            })}
                        </List>
                    </Popover>

                    <Box sx={{ flexGrow: 1 }} />

                    {/* Drilling Metrics in Header */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, mx: 4 }}>
                        {/* Rig Activity */}
                        <Box sx={{ textAlign: 'center', minWidth: 100 }}>
                            <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', mb: -0.5 }}>ACTIVITY</Typography>
                            <Typography variant="body2" sx={{
                                fontWeight: 'bold',
                                color: rigData.wob > 1 ? '#4ade80' : '#38bdf8'
                            }}>
                                {rigData.wob > 1 ? 'DRILLING' : (rigData.block_position > 1 && rigData.block_position < 99) ? 'TRIPPING' : 'IDLE'}
                            </Typography>
                        </Box>

                        <Divider orientation="vertical" flexItem sx={{ bgcolor: '#334155', height: '24px', alignSelf: 'center' }} />

                        {/* Hole Depth */}
                        <Box sx={{ textAlign: 'center', minWidth: 110 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                                <Typography variant="caption" sx={{ color: '#94a3b8' }}>HOLE DEPTH</Typography>
                                {!isViewer && (
                                    <IconButton
                                        size="small"
                                        onClick={() => {
                                            setCalibrationValues({ bitDepth: formatDepth(rigData.bit_depth), holeDepth: formatDepth(rigData.hole_depth) });
                                            setIsDrillingDialogOpen(true);
                                        }}
                                        sx={{ color: '#64748b', p: 0.2, '&:hover': { color: '#4ade80' } }}
                                    >
                                        <Edit2 size={10} />
                                    </IconButton>
                                )}
                            </Box>
                            <Typography variant="body1" sx={{ fontWeight: 'bold', color: '#4ade80', lineHeight: 1 }}>
                                {formatDepth(rigData.hole_depth)}
                                {isViewer ? (
                                    <span style={{ fontSize: '0.6rem', color: '#64748b', marginLeft: 4 }}>{units.depth}</span>
                                ) : (
                                    <Button
                                        variant="text" size="small"
                                        onClick={handleUnitToggle}
                                        sx={{ minWidth: 'auto', p: 0, ml: 0.5, color: '#64748b', fontSize: '0.6rem', textTransform: 'lowercase' }}
                                    >
                                        {units.depth}
                                    </Button>
                                )}
                            </Typography>
                        </Box>

                        <Divider orientation="vertical" flexItem sx={{ bgcolor: '#334155', height: '24px', alignSelf: 'center' }} />

                        {/* Bit Position */}
                        <Box sx={{ textAlign: 'center', minWidth: 110 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                                <ArrowDownToLine size={12} color="#94a3b8" />
                                <Typography variant="caption" sx={{ color: '#94a3b8' }}>BIT POS</Typography>
                                {!isViewer && (
                                    <IconButton
                                        size="small"
                                        onClick={() => {
                                            setCalibrationValues({ bitDepth: formatDepth(rigData.bit_depth), holeDepth: formatDepth(rigData.hole_depth) });
                                            setIsDrillingDialogOpen(true);
                                        }}
                                        sx={{ color: '#64748b', p: 0.2, '&:hover': { color: '#38bdf8' } }}
                                    >
                                        <Edit2 size={10} />
                                    </IconButton>
                                )}
                            </Box>
                            <Typography variant="body1" sx={{ fontWeight: 'bold', color: '#38bdf8', lineHeight: 1 }}>
                                {formatDepth(rigData.bit_depth)}
                                <span style={{ fontSize: '0.6rem', color: '#64748b', marginLeft: 4 }}>{units.depth}</span>
                            </Typography>
                        </Box>
                    </Box>

                    <Box sx={{ flexGrow: 1 }} />

                    {/* Right side - Rig/Well info & Logout */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, bgcolor: '#1e293b', px: 2, py: 1, borderRadius: 1 }}>
                            <Box sx={{ minWidth: 65 }}>
                                <Typography variant="body2" sx={{ color: '#94a3b8', lineHeight: 1 }}>Rig</Typography>
                                <Typography variant="subtitle2" sx={{ color: '#38bdf8', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{wellInfo.rig}</Typography>
                            </Box>
                            <Box sx={{ width: '1px', height: '20px', bgcolor: '#334155' }} />
                            <Box sx={{ minWidth: 65 }}>
                                <Typography variant="body2" sx={{ color: '#94a3b8', lineHeight: 1 }}>Well</Typography>
                                <Typography variant="subtitle2" sx={{ color: '#38bdf8', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{wellInfo.well}</Typography>
                            </Box>
                            {!isViewer && (
                                <IconButton size="small" onClick={handleEditClick} sx={{ color: '#38bdf8', bgcolor: 'rgba(56, 189, 248, 0.1)', ml: 1, '&:hover': { bgcolor: 'rgba(56, 189, 248, 0.2)' } }}>
                                    <Edit2 size={14} />
                                </IconButton>
                            )}
                        </Box>
                        <IconButton onClick={handleLogout} sx={{ color: '#ef4444', '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.1)' }, flexShrink: 0 }} title="Logout">
                            <LogOut size={20} />
                        </IconButton>
                    </Box>
                </Toolbar>
            </AppBar>

            {/* Edit Details Dialog */}
            {/* Edit details dialog remains same */}
            <Dialog open={isDialogOpen} onClose={() => setIsDialogOpen(false)} PaperProps={{ sx: { bgcolor: '#1e293b', color: 'white', minWidth: 400 } }}>
                {/* ... existing Dialog content ... */}
                <DialogTitle>Edit Operation Details</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Well Name"
                        fullWidth
                        variant="outlined"
                        value={tempInfo.well}
                        onChange={(e) => setTempInfo({ ...tempInfo, well: e.target.value })}
                        sx={{
                            mb: 2,
                            '& .MuiOutlinedInput-root': { color: 'white', '& fieldset': { borderColor: '#334155' } },
                            '& .MuiInputLabel-root': { color: '#94a3b8' }
                        }}
                    />
                    <TextField
                        margin="dense"
                        label="Rig Name"
                        fullWidth
                        variant="outlined"
                        value={tempInfo.rig}
                        onChange={(e) => setTempInfo({ ...tempInfo, rig: e.target.value })}
                        sx={{
                            '& .MuiOutlinedInput-root': { color: 'white', '& fieldset': { borderColor: '#334155' } },
                            '& .MuiInputLabel-root': { color: '#94a3b8' }
                        }}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button onClick={() => setIsDialogOpen(false)} sx={{ color: '#94a3b8' }}>Cancel</Button>
                    <Button onClick={handleSaveInfo} variant="contained" sx={{ bgcolor: '#38bdf8', color: '#0f172a', '&:hover': { bgcolor: '#0ea5e9' } }}>Save Changes</Button>
                </DialogActions>
            </Dialog>

            {/* Global Depth Calibration Dialog */}
            <Dialog
                open={isDrillingDialogOpen}
                onClose={() => setIsDrillingDialogOpen(false)}
                PaperProps={{ sx: { bgcolor: '#1e293b', color: 'white', minWidth: 350 } }}
            >
                <DialogTitle>Set Depths</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2 }}>
                        <TextField
                            label={`Bit Depth (${units.depth})`}
                            type="number"
                            value={calibrationValues.bitDepth}
                            onChange={(e) => setCalibrationValues({ ...calibrationValues, bitDepth: e.target.value })}
                            fullWidth size="small"
                            sx={{ '& .MuiOutlinedInput-root': { color: 'white' }, '& .MuiInputLabel-root': { color: '#94a3b8' } }}
                        />
                        <TextField
                            label={`Hole Depth (${units.depth})`}
                            type="number"
                            value={calibrationValues.holeDepth}
                            onChange={(e) => setCalibrationValues({ ...calibrationValues, holeDepth: e.target.value })}
                            fullWidth size="small"
                            sx={{ '& .MuiOutlinedInput-root': { color: 'white' }, '& .MuiInputLabel-root': { color: '#94a3b8' } }}
                        />
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setIsDrillingDialogOpen(false)} sx={{ color: '#94a3b8' }}>Cancel</Button>
                    <Button onClick={handleSetDepth} variant="contained" sx={{ bgcolor: '#38bdf8', color: '#0f172a' }}>Save Depths</Button>
                </DialogActions>
            </Dialog>

            {/* Main Content */}
            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    px: 3,
                    pb: 3,
                    pt: 1,
                    bgcolor: '#0f172a',
                    minHeight: '100vh',
                    color: 'white'
                }}
            >
                <Toolbar />
                <Outlet />
            </Box>

            {/* Real-time Alarm Banner Popup Stack */}
            <Box
                sx={{
                    position: 'fixed',
                    bottom: 24,
                    right: 24,
                    zIndex: 99999,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1.5,
                    maxWidth: 400,
                    width: '100%',
                    pointerEvents: 'none' // allow clicking through empty spaces
                }}
            >
                {activeAlarms.map((alarm) => (
                    <Box
                        key={alarm.id}
                        sx={{
                            pointerEvents: 'auto', // enable mouse events for card
                            p: 2,
                            borderRadius: 2,
                            bgcolor: alarm.level === 'CRITICAL' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                            backdropFilter: 'blur(16px)',
                            border: `1px solid ${alarm.level === 'CRITICAL' ? '#ef4444' : '#fbbf24'}`,
                            boxShadow: `0 8px 32px rgba(0,0,0,0.5), inset 0 0 10px ${alarm.level === 'CRITICAL' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                            display: 'flex',
                            gap: 1.5,
                            alignItems: 'flex-start',
                            position: 'relative',
                            overflow: 'hidden',
                            animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                            '@keyframes slideIn': {
                                '0%': { transform: 'translateX(120%)', opacity: 0 },
                                '100%': { transform: 'translateX(0)', opacity: 1 }
                            }
                        }}
                    >
                        {/* Alarm Level Accent Bar */}
                        <Box
                            sx={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: '4px',
                                bgcolor: alarm.level === 'CRITICAL' ? '#ef4444' : '#fbbf24',
                                animation: 'flash 1s infinite alternate',
                                '@keyframes flash': {
                                    '0%': { opacity: 0.4 },
                                    '100%': { opacity: 1 }
                                }
                            }}
                        />

                        {/* Pulsing Icon */}
                        <Box
                            sx={{
                                color: alarm.level === 'CRITICAL' ? '#ef4444' : '#fbbf24',
                                display: 'flex',
                                alignItems: 'center',
                                mt: 0.5,
                                animation: 'pulseGlow 1s infinite alternate',
                                '@keyframes pulseGlow': {
                                    '0%': { transform: 'scale(0.9)', filter: 'drop-shadow(0 0 2px rgba(0,0,0,0))' },
                                    '100%': { transform: 'scale(1.1)', filter: `drop-shadow(0 0 6px ${alarm.level === 'CRITICAL' ? '#ef4444' : '#fbbf24'})` }
                                }
                            }}
                        >
                            {alarm.level === 'CRITICAL' ? <ShieldAlert size={22} /> : <AlertTriangle size={22} />}
                        </Box>

                        {/* Message Details */}
                        <Box sx={{ flexGrow: 1, pr: 1 }}>
                            <Typography
                                variant="subtitle2"
                                sx={{
                                    color: 'white',
                                    fontWeight: 'bold',
                                    textTransform: 'uppercase',
                                    letterSpacing: 0.5,
                                    fontSize: '0.85rem'
                                }}
                            >
                                {alarm.label} - {alarm.level}
                            </Typography>
                            <Typography
                                variant="caption"
                                sx={{
                                    color: '#cbd5e1',
                                    display: 'block',
                                    mt: 0.2,
                                    fontSize: '0.75rem',
                                    lineHeight: 1.3
                                }}
                            >
                                Value is <span style={{ color: alarm.level === 'CRITICAL' ? '#fca5a5' : '#fde047', fontWeight: 'bold' }}>{alarm.value} {alarm.unit}</span> which {alarm.msg} ({alarm.limit} {alarm.unit}).
                            </Typography>
                        </Box>
                    </Box>
                ))}
            </Box>
        </Box>
    );
}
