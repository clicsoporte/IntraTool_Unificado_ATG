import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/log_entry.dart';
import '../services/logger_service.dart';

class LogViewerScreen extends StatefulWidget {
  final LoggerService logger;
  const LogViewerScreen({super.key, required this.logger});

  @override
  State<LogViewerScreen> createState() => _LogViewerScreenState();
}

class _LogViewerScreenState extends State<LogViewerScreen> {
  List<LogEntry> _logs = [];
  bool _loading = true;
  String _selectedLevel = 'ALL';
  String _searchQuery = '';
  final TextEditingController _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadLogs();
  }

  Future<void> _loadLogs() async {
    setState(() => _loading = true);
    final logs = await widget.logger.getLogs(
      filterLevel: _selectedLevel,
      searchQuery: _searchQuery,
    );
    if (mounted) {
      setState(() {
        _logs = logs;
        _loading = false;
      });
    }
  }

  Color _getLevelColor(String level) {
    switch (level) {
      case 'ERROR':
        return Colors.red;
      case 'WARN':
        return Colors.orange;
      case 'SUCCESS':
        return Colors.green;
      default:
        return Colors.blue;
    }
  }

  Future<void> _copyAllLogs() async {
    final buffer = StringBuffer();
    for (var l in _logs) {
      buffer.writeln("[${l.timestamp}] [${l.level}] [${l.category}] ${l.message}");
      if (l.details != null && l.details!.isNotEmpty) {
        buffer.writeln("  Detalles: ${l.details}");
      }
    }
    await Clipboard.setData(ClipboardData(text: buffer.toString()));
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Logs copiados al portapapeles 📋')),
      );
    }
  }

  Future<void> _clearLogs() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Vaciar Historial de Logs'),
        content: const Text('¿Estás seguro de que deseas eliminar permanentemente todos los registros de SQLite?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Vaciar')),
        ],
      ),
    );

    if (confirm == true) {
      await widget.logger.clearLogs();
      await _loadLogs();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Historial SQLite (Logs 📊)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        actions: [
          IconButton(
            icon: const Icon(Icons.copy_all),
            tooltip: 'Copiar todo',
            onPressed: _logs.isEmpty ? null : _copyAllLogs,
          ),
          IconButton(
            icon: const Icon(Icons.delete_outline),
            tooltip: 'Vaciar logs',
            onPressed: _logs.isEmpty ? null : _clearLogs,
          ),
        ],
      ),
      body: Column(
        children: [
          // Search & Filters
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: TextField(
              controller: _searchCtrl,
              decoration: InputDecoration(
                hintText: 'Buscar en mensajes o errores...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchQuery.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _searchCtrl.clear();
                          setState(() => _searchQuery = '');
                          _loadLogs();
                        },
                      )
                    : null,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              ),
              onChanged: (v) {
                setState(() => _searchQuery = v);
                _loadLogs();
              },
            ),
          ),

          // Filter pills
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Row(
              children: ['ALL', 'ERROR', 'SUCCESS', 'INFO', 'WARN'].map((lvl) {
                final sel = _selectedLevel == lvl;
                return Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: FilterChip(
                    label: Text(lvl == 'ALL' ? 'TODOS' : lvl),
                    selected: sel,
                    onSelected: (val) {
                      setState(() => _selectedLevel = lvl);
                      _loadLogs();
                    },
                    selectedColor: const Color(0xFFFF6B00).withOpacity(0.2),
                    checkmarkColor: const Color(0xFFFF6B00),
                  ),
                );
              }).toList(),
            ),
          ),

          const Divider(),

          // Log List
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _logs.isEmpty
                    ? const Center(
                        child: Text('No hay registros de log guardados.', style: TextStyle(color: Colors.grey)),
                      )
                    : RefreshIndicator(
                        onRefresh: _loadLogs,
                        child: ListView.separated(
                          itemCount: _logs.length,
                          separatorBuilder: (ctx, i) => const Divider(height: 1),
                          itemBuilder: (ctx, i) {
                            final log = _logs[i];
                            final color = _getLevelColor(log.level);
                            return ListTile(
                              dense: true,
                              leading: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: color.withOpacity(0.15),
                                  borderRadius: BorderRadius.circular(4),
                                  border: Border.all(color: color.withOpacity(0.4)),
                                ),
                                child: Text(
                                  log.level,
                                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: color),
                                ),
                              ),
                              title: Text(
                                log.message,
                                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                              ),
                              subtitle: Text(
                                "[${log.category}] • ${log.timestamp}${log.details != null ? '\n${log.details}' : ''}",
                                style: const TextStyle(fontSize: 11, color: Colors.grey),
                              ),
                            );
                          },
                        ),
                      ),
          ),
        ],
      ),
    );
  }
}
