import React, { useState, useEffect } from 'react';
import { Box, Paper, Typography, IconButton, Grid, Dialog, DialogTitle, DialogContent, FormControl, InputLabel, Select, MenuItem, Button, DialogActions } from '@mui/material';
import { Settings, Edit2, Activity } from 'lucide-react';

const AVAILABLE_METRICS = [
    { key: 'hook_load', label: 'Hook Load', unit: 'tons' },
    { key: 'wob', label: 'Weight on Bit', unit: 'kips' },
    { key: 'rop', label: 'Rate of Penetration', unit: 'ft/hr' },
    { key: 'bit_depth', label: 'Bit Depth', unit: 'ft' },
    { key: 'hole_depth', label: 'Hole Depth', unit: 'ft' },
    { key: 'block_position', label: 'Block Position', unit: 'ft' },
    { key: 'pump_pressure', label: 'Pump Pressure', unit: 'psi' },
    { key: 'engine_rpm', label: 'Engine RPM', unit: 'RPM' },
    { key: 'torque', label: 'Torque', unit: 'ft-lbs' },
    { key: 'flow_in', label: 'Flow In', unit: 'GPM' },
    { key: 'flow_out', label: 'Flow Out', unit: 'GPM' },
    { key: 'oil_pressure', label: 'Oil Pressure', unit: 'kPa' },
    { key: 'spm1', label: 'SPM 1', unit: 'spm' },
    { key: 'spm2', label: 'SPM 2', unit: 'spm' },
    { key: 'trip_tank', label: 'Trip Tank', unit: 'm³' },
    { key: 'rig_air_pressure', label: 'Rig Air Pressure', unit: 'psi' },
    { key: 'total_spm', label: 'Total SPM', unit: 'spm' },
    { key: 'annular_pressure', label: 'Annular Pressure', unit: 'psi' },
    { key: 'manifold_pressure', label: 'Manifold Pressure', unit: 'psi' },
    { key: 'accumulator_pressure', label: 'Accumulator Pressure', unit: 'psi' },
    { key: 'tong_torque', label: 'Tong Torque', unit: 'KNM' },
];

const DEFAULT_CONFIG = [
    { key: 'rig_air_pressure', label: 'Air Press.', unit: 'PSI' },
    { key: 'torque', label: 'Rotary Torque', unit: 'ft-lbs' }
];

const StatsPanel = ({ rigData, w, h, onParameterClick }) => {
    const [config, setConfig] = useState(DEFAULT_CONFIG);
    const [editMode, setEditMode] = useState(false);
    const [editingSlot, setEditingSlot] = useState(null); 
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const isSmall = !h || h < 7;
    const itemCols = w < 4 ? 12 : 6;
    const [tempConfig, setTempConfig] = useState({ key: '', label: '', unit: '' });

    useEffect(() => {
        const saved = localStorage.getItem('romi_key_performance_config_v1');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setConfig(parsed);
                }
            } catch (e) {
                console.warn("Failed to parse saved config", e);
            }
        }
    }, []);

    const saveConfig = (newConfig) => {
        setConfig(newConfig);
        localStorage.setItem('romi_key_performance_config_v1', JSON.stringify(newConfig));
    };

    const handleEditClick = (index) => {
        if (!editMode) return;
        setEditingSlot(index);
        const current = config[index];
        setTempConfig(current);
        setIsDialogOpen(true);
    };

    const handleSaveSlot = () => {
        const newConfig = [...config];
        const metric = AVAILABLE_METRICS.find(m => m.key === tempConfig.key);

        newConfig[editingSlot] = {
            key: tempConfig.key,
            label: metric ? metric.label.toUpperCase() : 'UNKNOWN',
            unit: metric ? metric.unit : ''
        };

        saveConfig(newConfig);
        setIsDialogOpen(false);
    };

    const getValue = (key) => {
        let val = rigData[key];
        if (val === undefined || val === null) return '0';
        if (typeof val === 'number') {
            if (key === 'hook_load') return val.toFixed(2);
            if (key.includes('depth')) return val.toFixed(1);
            if (key === 'wob') return val.toFixed(1);
            return val.toFixed(0);
        }
        return val;
    };

    return (
        <Box sx={{ p: isSmall ? 1.5 : 2, flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', width: '100%', height: '100%', position: 'relative' }}>
            <Box sx={{ position: 'absolute', right: 8, top: 8, zIndex: 10 }}>
                <IconButton
                    size="small"
                    onClick={() => setEditMode(!editMode)}
                    sx={{ 
                        color: editMode ? '#fbbf24' : '#64748b', 
                        bgcolor: editMode ? 'rgba(251, 191, 36, 0.1)' : 'rgba(15, 23, 42, 0.2)',
                        '&:hover': { bgcolor: 'rgba(30, 41, 59, 0.6)' }
                    }}
                >
                    <Settings size={isSmall ? 12 : 14} />
                </IconButton>
            </Box>
            <Grid 
                container 
                spacing={isSmall ? 1 : 2} 
                sx={{ 
                    flexGrow: 1, 
                    overflow: 'auto',
                    '&::-webkit-scrollbar': { display: 'none' },
                }}
            >
                {config.map((item, index) => (
                    <Grid item xs={itemCols} key={index} sx={{ display: 'flex' }}>
                        <Paper
                            onClick={() => {
                                if (editMode) {
                                    handleEditClick(index);
                                } else if (onParameterClick) {
                                    onParameterClick(item.key, item.label, item.unit);
                                }
                            }}
                            sx={{
                                width: '100%',
                                p: isSmall ? 1 : 1.5,
                                bgcolor: 'rgba(30, 41, 59, 0.5)',
                                color: 'white',
                                textAlign: 'center',
                                border: editMode ? '1px dashed #fbbf24' : '1px solid rgba(51, 65, 85, 0.5)',
                                cursor: 'pointer',
                                position: 'relative',
                                borderRadius: 2,
                                height: '100%',
                                minHeight: isSmall ? '60px' : '100px',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                transition: 'all 0.2s',
                                '&:hover': {
                                    bgcolor: 'rgba(30, 41, 59, 0.8)',
                                    transform: 'translateY(-2px)'
                                }
                            }}
                        >
                            {editMode && (
                                <Box sx={{ position: 'absolute', top: 5, right: 5, color: '#fbbf24' }}>
                                    <Edit2 size={12} />
                                </Box>
                            )}
                            <Typography variant="caption" sx={{ color: '#94a3b8', letterSpacing: 1, fontWeight: 'bold', mb: 0.5, fontSize: isSmall ? '0.6rem' : '0.75rem' }}>
                                {item.label}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 0.5 }}>
                                <Typography variant={isSmall ? 'h6' : 'h5'} sx={{ fontWeight: 'bold', color: '#38bdf8' }}>
                                    {getValue(item.key)}
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#64748b', fontSize: isSmall ? '0.6rem' : '0.75rem' }}>
                                    {item.unit}
                                </Typography>
                            </Box>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            {/* Config Dialog */}
            <Dialog
                open={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                PaperProps={{ sx: { bgcolor: '#1e293b', color: 'white', minWidth: 300 } }}
            >
                <DialogTitle>Configure Slot {editingSlot + 1}</DialogTitle>
                <DialogContent>
                    <FormControl fullWidth sx={{ mt: 2 }}>
                        <InputLabel sx={{ color: '#94a3b8' }}>Parameter</InputLabel>
                        <Select
                            value={tempConfig.key}
                            label="Parameter"
                            onChange={(e) => setTempConfig({ ...tempConfig, key: e.target.value })}
                            sx={{ color: 'white', '.MuiOutlinedInput-notchedOutline': { borderColor: '#475569' }, '& .MuiSvgIcon-root': { color: '#94a3b8' } }}
                        >
                            {AVAILABLE_METRICS.map((m) => (
                                <MenuItem key={m.key} value={m.key}>
                                    {m.label} ({m.unit})
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsDialogOpen(false)} sx={{ color: '#94a3b8' }}>Cancel</Button>
                    <Button onClick={handleSaveSlot} variant="contained" sx={{ bgcolor: '#38bdf8' }}>Save</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default StatsPanel;
